# 결제 설계 (Payment Design)

> **이 문서의 성격 — 먼저 읽기**
>
> - 이 문서는 **설계 문서**다. 결제 관련 **코드·스키마·마이그레이션·라우트는 도입하지 않는다**(로드맵 4주차: "결제는 설계만").
> - 이 프로젝트는 **포트폴리오 목적**이다. 실제 카드 승인·정산·수익화를 운영하려는 시스템이 아니라, "결제를 붙인다면 어떻게 설계할 것인가"를 보여주는 설계 산출물이다. 따라서 실제 PG 계약·사업자 정산·세금계산서 같은 운영 영역은 범위 밖이며, 필요한 지점만 "이렇게 연결된다"로 명시한다.
> - canonical 규칙은 root [`AGENTS.md`](../AGENTS.md)이며, 이 문서는 그 6원칙(SSOT·SRP·Consistency·Atomicity·Idempotency·No Silent Fallback)을 결제 도메인에 적용한 결과다.

---

## 1. 배경 — 지금 무엇이 있고 무엇이 없나

| 항목 | 현재 상태 | 근거 |
|---|---|---|
| 예약 가격 | 예약 시점 `getGymSportPrice` 스냅샷을 `reservation.price`(Int)로 박제 | [schema.prisma](../prisma/schema.prisma) `Reservation.price`, [db-reservation-repository.ts:720](../src/lib/server/db-reservation-repository.ts#L720) |
| 예약 상태 | `RESERVATION_STATUSES = [reserved, cancelled, used]` | `src/lib/domain-constants` |
| 예약 생성 | 슬롯 점유 + 예약 생성 + 락을 **단일 트랜잭션**으로 원자 처리 | [db-reservation-repository.ts:755](../src/lib/server/db-reservation-repository.ts#L755) |
| 중복 방지 | `ReservationLock.activeKey` UNIQUE PK → P2002로 멱등 보장 | [db-reservation-repository.ts:772](../src/lib/server/db-reservation-repository.ts#L772) |
| 매출 집계 | `reservation.price` 합으로 expected/used 매출 산출 (장부상 예약가치) | [db-revenue-repository.ts](../src/lib/server/db-revenue-repository.ts) |
| 결제 | **없음.** 예약은 무료로 생성되고 수금 개념이 없다 | — |

→ **토대 절반은 이미 있다.** `reservation.price`가 "받아야 할 금액"의 SSOT다. 빠진 것은 "그 금액을 실제로 받았는가(결제)"와 그 상태 관리다.

## 2. 결제 모델 — 예약 시 선결제(prepay at booking)

선택한 모델은 **예약 시 선결제**다. 예약 생성이 결제 성공에 묶인다.

이유:
- **매출 정합** — 매출/정산 기능의 `used`(이용완료) 합이 곧 "실제 수금액"과 일치하게 만들 수 있다. 현장 결제는 시스템 밖에서 돈이 오가 정산과 어긋난다.
- **노쇼/정원 보호** — 결제가 자리를 잡으므로 무단 예약·노쇼가 줄고, 정원 슬롯이 의미 있게 소진된다.

대가:
- 예약 생성이 **다단계 흐름**(슬롯 확보 → 결제 → 확정)이 되어 **부분 실패**가 생긴다. 지금의 단일 트랜잭션 원자성을 그대로 쓸 수 없다(§4). 이 설계의 난이도 대부분이 여기 있다.

## 3. 설계 원칙 (이 도메인에 고정)

1. **별도 payment 도메인.** `RESERVATION_STATUSES`에 `pending/paid`를 절대 섞지 않는다. 결제 상태는 `Payment` 엔티티의 독립 상태머신으로 둔다. 예약 상태와 결제 상태는 **다른 축**이다.
2. **`reservation.price`가 청구 금액 SSOT.** 결제 금액은 이 스냅샷에서 파생하며, 클라이언트가 보낸 금액을 신뢰하지 않는다.
3. **No Silent Fallback.** 결제 실패/미확정을 성공처럼 보이게 하지 않는다. 중간 단계 실패는 명시적 상태(`failed`, `expired`)로 남기고 사용자에게 재시도 경로를 준다.
4. **Idempotency 우선.** 결제 시작·webhook 수신·확정은 모두 재시도 안전해야 한다(중복 청구·중복 예약 금지).
5. **카드 원문 비저장.** 카드번호·CVC는 서버에 저장하지 않는다(PG 위임 = PCI 범위 회피). 우리는 PG가 준 토큰/결제키만 다룬다.

## 4. 예약 생성 흐름 재구성 — 부분 실패 매트릭스

현재(무료)는 1트랜잭션이다. 선결제는 **3구간**으로 나뉜다. 각 경계가 실패 지점이다.

```
[A] 슬롯 임시점유 + Payment(pending) 생성     (우리 DB, 1 트랜잭션)
        │
        ▼
[B] PG 결제창 승인                            (외부 PG, 우리 통제 밖)
        │
        ▼
[C] 확정: Payment(paid) + Reservation(reserved) + Lock   (우리 DB, 1 트랜잭션)
```

핵심: **[A]에서 슬롯을 "임시 점유(hold)"** 하고, **[C]에서 비로소 예약을 `reserved`로 확정**한다. [B] 동안 다른 사용자가 같은 슬롯을 못 가져가게 hold가 막는다.

| 실패 지점 | 사용자 상태 | 데이터 상태 | 복구 |
|---|---|---|---|
| [A] 실패 | "잠시 후 다시" | 아무것도 안 생김 | 재시도(멱등) |
| [B] 결제 취소/실패 | "결제가 취소됨" | Payment=`failed`, hold 만료 예정 | hold TTL 경과 시 슬롯 자동 반환 |
| [B] 후 사용자 이탈(확정 콜백 못 받음) | — | Payment=`pending`, hold 유지 | **webhook**이 진실원본 → [C] 수행. hold TTL 내 미확정이면 PG 자동취소/환불 |
| [C] 트랜잭션 실패(결제는 됐는데 예약 확정 실패) | "처리 중 오류, 확인 중" | Payment=`paid`, Reservation 없음 | **reconciliation 잡**이 감지 → 재확정 시도, 불가 시 **자동 환불** + 사용자 통지 |

→ **진실의 단일 원본은 PG webhook이다.** 브라우저 redirect 콜백은 보조일 뿐, 사용자가 창을 닫아도 webhook으로 [C]가 진행되도록 설계한다(클라이언트 신뢰 금지).

### hold(임시 점유)에 대해
- 현재 슬롯 모델([db-reservation-repository.ts](../src/lib/server/db-reservation-repository.ts) `reserveSlot`/`ReservationSlot.reservedCount`)은 "확정 예약"만 카운트한다.
- 선결제는 **결제 진행 중 hold**라는 중간 점유가 필요하다. 설계안: `reservedCount`와 별개로 `heldCount`(+ hold 만료 시각)를 두거나, `Payment(pending)` 행 자체를 hold로 보고 정원 계산 시 `reserved + 유효한 pending`을 합산. **SSOT 분산을 피하려면 후자(Payment를 hold의 단일 근거로)가 낫다.**

## 5. 데이터 모델 (제안 — 구현 아님)

`Payment`를 **별도 테이블**로 둔다. 예약과 1:1(또는 결제 재시도 이력까지 보려면 1:N + 활성 1건).

```
Payment
  id                cuid
  reservationId?    예약 확정 전이면 null 가능 → 확정 시 연결 (또는 holdKey로 슬롯 참조)
  userId            Firebase uid (예약과 동일 기준)
  amount            Int   ← reservation.price에서 파생, SSOT 일치 검증
  currency          "KRW" 고정(설계 단계)
  status            PaymentStatus (아래 상태머신)
  provider          "toss" 등 (§7 추상화)
  providerPaymentId 외부 PG 결제키 (승인 응답)
  idempotencyKey    우리 발급, 결제 시작·webhook 중복 차단의 키
  failureReason?    실패/취소 사유(표시·운영용, 카드정보 아님)
  createdAt / updatedAt
  (인덱스: idempotencyKey UNIQUE, reservationId, status+createdAt)
```

- **신규 테이블이므로 마이그레이션에 `ENABLE ROW LEVEL SECURITY`(deny-default)를 반드시 포함** — 기존 테이블과 동일 패턴([ops-runbook.md §3](ops-runbook.md), `20260526124231_enable_rls_deny_default`).
- 카드 PAN/CVC 같은 민감 결제수단 원문은 **컬럼 자체를 두지 않는다.**

## 6. 결제 상태머신 (예약 상태와 분리된 축)

```
PaymentStatus:
  pending ──▶ paid ──▶ refunded            (정상 + 환불)
     │          └─▶ partially_refunded     (부분 환불, 선택)
     ├──▶ failed        (PG 승인 거절/오류)
     └──▶ expired       (hold TTL 초과, 미승인)
```

예약 상태와의 정합 규칙(불변식):
- `Reservation.status = reserved` ⟺ 연결된 `Payment.status ∈ {paid, partially_refunded}` (확정 예약은 결제 완료가 전제).
- `Reservation.status = cancelled` ⟹ `Payment.status ∈ {refunded, partially_refunded, failed, expired}` (취소된 예약에 살아있는 결제가 남지 않음).
- `Payment.status = pending`인 동안 예약 행은 **아직 만들지 않는다**(= 확정 전). 정원은 hold로만 잡는다.

→ 두 상태가 **다른 엔티티**이므로 `RESERVATION_STATUSES`는 손대지 않는다(원칙 1 충족).

## 7. PG 추상화 + 예시(토스페이먼츠)

provider-특정 코드가 도메인에 새지 않도록 **인터페이스 경계**를 둔다(현재 `gym BACKEND` provider 전환과 같은 추상화 결).

```
interface PaymentProvider {
  createCheckout(input): { redirectUrl, providerRef }   // 결제창 생성
  confirm(input): { status, providerPaymentId, paidAmount }   // 승인 확정
  cancel(input): { status, refundedAmount }              // 취소/환불
  verifyWebhook(rawBody, signature): WebhookEvent | null  // 서명 검증
}
```

- **예시 구현 가정: 토스페이먼츠.** 결제창 → `successUrl/failUrl` redirect → 서버가 `confirm`(결제키+주문번호+금액)로 **승인 확정**. 금액은 우리 `Payment.amount`와 **반드시 서버에서 대조**(클라이언트 금액 불신).
- **webhook**: PG가 비동기로 보내는 결제 상태 이벤트가 진실원본(§4). `verifyWebhook`으로 **서명 검증** 후에만 신뢰. 검증 실패 이벤트는 무시하고 기록.
- provider 전환/추가는 이 인터페이스 구현만 갈아끼우면 되도록 둔다(SSOT: provider 선택값 한 곳).

## 8. 멱등성·재시도

- **idempotencyKey**: 결제 시작 시 우리 발급, `Payment.idempotencyKey` UNIQUE. 같은 키 재요청은 새 결제를 만들지 않고 기존 결과를 반환.
- **webhook 재수신**: PG는 같은 이벤트를 여러 번 보낼 수 있다. `providerPaymentId` + 상태 전이의 **단방향성**으로 중복 적용 차단(`paid`를 다시 `paid`로 만들지 않음, 이미 `refunded`면 무시).
- **확정 [C] 재시도**: `(reservation 확정 + payment=paid)`를 단일 트랜잭션으로 묶고, `activeKey` UNIQUE(기존 락 메커니즘)로 중복 확정 차단 — 현재 [db-reservation-repository.ts:772](../src/lib/server/db-reservation-repository.ts#L772) 패턴 재사용.

## 9. 취소·환불

기존 취소 경로와 연결:
- 사용자 취소 [cancelReservationInDb](../src/lib/server/db-reservation-repository.ts), 관리자 취소 [cancelReservationAsAdminInDb](../src/lib/server/db-reservation-repository.ts).
- 선결제에선 이 취소가 **환불을 동반**해야 한다: `Reservation → cancelled` 전이 시 `provider.cancel()` 호출 → `Payment → refunded`.
- **취소 마감기한**: 이미 화면에 `formatCancellationDeadline` 개념이 있다([reservation-ticket.tsx](../src/components/reservation-ticket.tsx)). 기한 전후로 **전액/부분/불가** 환불 정책을 둘 수 있다(부분 환불 = `partially_refunded`).
- **부분 실패**(예약은 취소됐는데 환불 API 실패): No Silent Fallback — 취소를 성공으로 닫지 않고 `Payment`를 `refund_pending` 같은 상태로 남겨 reconciliation/재시도. (관리자 운영 이력 audit에 기록 → 2주차 [safeRecordAuditLog](../src/lib/server/db-audit-repository.ts) 패턴 확장: `payment.refund` 등 액션 추가.)

## 10. 매출/정산 기능과의 연결

- 현재 매출은 `reservation.price` 기반 **장부상 예약가치**다(결제 무관, [db-revenue-repository.ts](../src/lib/server/db-revenue-repository.ts)).
- 결제 도입 후 매출은 **두 층**이 된다:
  - **장부상(booking)**: 지금 그대로 `reservation.price` 합.
  - **실수금(collected)**: `Payment.status=paid`의 `amount` 합 − 환불액.
- 선결제 모델에서 둘은 **거의 일치**(확정=결제완료)하나, 환불·부분환불 때문에 실수금이 더 정확하다. 매출 화면은 향후 "장부상 / 실수금"을 나란히 보여주는 방향으로 확장 가능(매출 화면의 expected/used 2열 구조를 그대로 잇는다).

## 11. 보안

- **비밀**: PG secret key·webhook secret은 `.env`/환경변수로만(코드·로그·문서에 원문 금지). [ops-runbook.md §비밀 취급](ops-runbook.md) 원칙 동일.
- **webhook 서명 검증 필수**: 검증 안 된 이벤트로 상태를 바꾸지 않는다(위조 결제완료 차단).
- **금액 서버 대조**: confirm 시 PG가 알린 결제금액과 `Payment.amount`(=`reservation.price`)를 서버에서 비교, 불일치는 거절.
- **rate limit**: 결제 시작·webhook 엔드포인트도 기존 DB rate limit 스코프로 보호([rate-limit.ts](../src/lib/server/rate-limit.ts)).
- **RLS**: `Payment` 테이블 deny-default(§5).
- **카드 원문 비저장**으로 PCI-DSS 핵심 범위를 회피.

## 12. 만약 구현한다면 (단계 스케치 — 지금은 도입하지 않음)

1. `Payment` 모델 + 마이그레이션(**RLS ENABLE 포함**) + client-safe 타입/타입가드(`src/lib/payment/*`).
2. `PaymentProvider` 인터페이스 + mock/예시(toss) 구현(`src/lib/server/payment/*`).
3. 예약 생성 라우트를 **[A] hold+pending → [B] 결제창 → [C] webhook 확정**으로 재구성. 기존 `createReservationInDb` 원자성은 [C]에 보존.
4. 취소 라우트에 환불 연결 + audit 액션(`payment.refund`).
5. reconciliation 잡(미확정 pending 만료, paid-but-no-reservation 보정).
6. 매출 화면에 실수금 열 추가(앞선 매출/정산 기능 연장).
7. 테스트: happy + 부분 실패(매트릭스 §4의 각 행) + webhook 재수신 멱등 + 금액 불일치 거절.

## 13. 미해결 / 결정 대기

- 부분 환불 정책(마감기한별 환불율)의 구체 수치 — 운영 정책 결정 필요.
- hold TTL 길이(결제창 이탈 시 슬롯 반환까지) — UX vs 정원 회전 트레이드오프.
- 결제 1:1 vs 재시도 이력 1:N — 실패 후 재결제 이력을 얼마나 남길지.
- (포트폴리오 범위라) 실제 PG 가입·정산·세금은 다루지 않음.
