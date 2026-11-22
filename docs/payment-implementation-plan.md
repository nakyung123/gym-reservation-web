# 결제 구현 계획 (토스페이먼츠 테스트 모드)

- 작성일: 2026-11-21
- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API·비밀 키·DB 구조)
- 근거 설계: [payment-design.md](payment-design.md)
- 상태: 승인됨(2026-11-21), 구현 중

## 목표

예약할 때 토스 결제창에서 테스트 결제를 하고, 승인되면 예약을 확정한다.
예약을 취소하면 토스 취소 API로 환불한다. 테스트 키만 쓰므로 실제 돈은 나가지 않는다.

## 흐름

1. [A] `POST /api/payments/prepare`
   - 로그인 확인 → 예약 규칙 재검증 → 트랜잭션 안에서 슬롯 정원 1 선점(기존 `reserveSlot` 재사용)
     → `Payment(pending, 만료 15분)` 생성.
   - 금액은 서버가 계산한다(`computeReservationPrice`).
   - 응답: `orderId`, `amount`, `orderName`
2. [B] 브라우저가 토스 결제창을 띄운다(SDK `requestPayment`, `method=CARD`).
3. [C] `/reserve/payment/success` 페이지 → `POST /api/payments/confirm {paymentKey, orderId, amount}`
   - 본인 결제인지, 금액이 같은지, pending이고 만료 전인지 확인한다.
   - status를 pending에서 confirming으로 바꾼다(조건부 UPDATE. 동시 요청은 한 건만 통과).
   - 토스 승인 API를 호출한다(`Idempotency-Key`=`confirm-{orderId}`).
   - 승인되면 한 트랜잭션에서 `Payment=paid`, `Reservation` 생성, `ReservationLock` 생성.
   - 완료되면 예약 상세 화면으로 이동한다.
4. 취소: 기존 사용자/관리자 취소 경로에 환불을 연결한다.
   - `Payment=refund_pending` → 토스 취소 API(`Idempotency-Key` 고정)
     → 성공하면 예약 취소와 `Payment=refunded`를 한 트랜잭션에서 처리한다.
   - 환불이 실패하면 예약을 취소하지 않고 502와 재시도 안내를 돌려준다.

## 부분 실패 처리

| 상황 | 처리 |
|---|---|
| [A] 실패 | 아무것도 남지 않음. 다시 시도 가능 |
| 결제창 닫음/실패 | fail 페이지에서 `Payment=failed`, 슬롯 반환 |
| 15분 넘게 승인 안 됨 | 만료 정리 시 `Payment=expired`, 슬롯 반환. 토스 쪽도 승인 안 하면 자동 만료되어 돈이 나가지 않음 |
| 토스 승인 거절 | `Payment=failed`, 슬롯 반환, 사유 표시 |
| 토스 승인 성공 + DB 확정 실패 | 즉시 토스 취소(환불) 시도 → `Payment=refunded`. 환불도 실패하면 confirming으로 남기고 정리 작업이 다시 처리 |
| confirming에서 서버가 죽음 | 정리 작업이 토스 조회 API로 실제 상태를 보고 확정하거나 환불 |
| 같은 confirm 두 번 | 두 번째는 기존 결과를 돌려줌(중복 예약 없음) |
| 환불 API 실패 | 예약 유지, refund_pending으로 남김, 다시 누르면 같은 멱등키로 재요청 |

만료 정리: prepare를 호출할 때마다 만료된 hold를 함께 정리한다(OAuth attempt와 같은 방식).
여기에 하루 1회 cron이 confirming/refund_pending을 다시 처리한다.

## 바꿀 것

- prisma: `Payment` 모델과 마이그레이션 (새 테이블만 추가, RLS deny-default 포함)
  - `holdKey` 컬럼(nullable UNIQUE): pending 동안 같은 사용자의 같은 슬롯 중복 결제를 막는다
- `src/lib/server/payment/`: PaymentProvider 인터페이스, 토스 구현(타임아웃 10초), 테스트용 가짜 구현
- `src/lib/server/db-payment-repository.ts`: prepare / confirm / fail / expire / refund
- API: `/api/payments/prepare`, `/api/payments/confirm`, `/api/payments/fail`, `/api/cron/payment-reconcile`
- 기존 취소 경로(사용자·관리자)에 환불 연결
- `POST /api/reservations`: 결제 모드에서는 결제 없이 예약을 만들 수 없게 거절(409)
- 화면: 예약 폼 제출 분기, `/reserve/payment/success`, `/reserve/payment/fail`, i18n 키(한·영)
- `next.config` CSP(Report-Only)에 토스 도메인 추가
- FAQ 봇 지식, 결제 문구의 "준비 중(데모)" 안내를 결제 모드에 맞게 수정
- `vercel.json`에 cron 1개 추가
- (2026-11-21 추가 승인) `src/lib/server/withdrawal-service.ts`: 결제 진행 중이면 탈퇴 차단, 탈퇴 시 결제 기록 삭제
- (2026-11-21 추가 승인) `package.json`: `@tosspayments/tosspayments-sdk@2.10.0`
- (2026-11-21 추가 승인) `.env.example`: 새 환경 변수 이름과 설명(값 없음)

## 안 바꿀 것

- `RESERVATION_STATUSES` (reserved/cancelled/used) 그대로
- 결제 없는 기존 예약 흐름 (플래그가 꺼져 있으면 지금과 똑같이 동작)
- 가상계좌, 부분 환불, 취소 마감 환불율 (이번 범위 밖)
- 운영 DB 마이그레이션, 커밋, 푸시 (각각 따로 승인)

## 기능 플래그와 비밀

- `PAYMENT_PROVIDER` = `none` | `toss` (기본 `none`)
- `TOSS_CLIENT_KEY` (공개 키), `TOSS_SECRET_KEY` (비밀)
  - (구현 중 변경) 클라이언트 키는 `NEXT_PUBLIC_`으로 번들에 넣지 않고 서버(page)가 props로 내려준다.
    결제 모드와 키를 서버 한 곳에서 읽기 위해서다.
- 키는 사용자가 직접 `.env.local`과 Vercel에 넣는다. Claude는 값을 보거나 출력하지 않는다.
- 서버는 `test_` 로 시작하지 않는 키(live 키)를 거부한다. 실수로 실결제가 되는 일을 코드로 막는다.

## 알려진 절충

- 결제 중인 hold도 `reservedCount`에 포함된다. 관리자 화면의 예약 수에 최대 15분간
  결제 중인 건이 섞일 수 있다. 대신 기존 원자적 정원 UPDATE를 그대로 쓸 수 있다.
- (2026-11-22 결정) 화면의 "카드"와 "간편결제" 선택지는 나눠 둔다. 둘 다 토스 결제창을 `method=CARD`로 연다.
  간편결제를 골라 결제가 끝나는 것을 로컬 테스트 결제로 확인했다. 선택한 값은 Payment·Reservation 의
  `paymentMethod` 에 그대로 저장된다.
- 웹훅은 이번 범위에서 뺀다. localhost로 받을 수 없고, `PAYMENT_STATUS_CHANGED` 서명 방식이
  문서로 확인되지 않았다. 브라우저 confirm과 정리 cron으로 대신한다. 다음 단계 후보로 둔다.

## 완료 조건 (실행으로 확인)

1. `npx tsc --noEmit --pretty false` 통과
2. `npm run lint` 통과
3. `npm run test` 전체 통과. 새 테스트(가짜 provider + test DB):
   - prepare: 정원 선점, 중복 prepare 거절, 마감 슬롯 거절, 금액 서버 계산
   - confirm: 성공 시 예약 1건, 금액 불일치 거절, 다른 사용자 거절, 만료 거절,
     중복 confirm 시 예약 1건, 토스 거절 시 슬롯 반환, DB 확정 실패 시 환불 호출
   - 취소: 환불 성공 시 취소, 환불 실패 시 예약 유지와 refund_pending, 재시도 성공
   - 정리: 만료 hold 슬롯 반환, confirming 재처리
   - 플래그 none일 때 기존 예약 API 동작 그대로(기존 테스트 통과)
   - live 키 거부
4. `npm run build` 통과
5. 로컬 dev + 토스 테스트 키로 결제 1회, 취소 1회 (Playwright 또는 사용자 눈 확인)
   - 토스 개발자센터 테스트 결제 내역에 승인과 취소가 보이는지 사용자가 확인

## 되돌리는 방법

- 즉시: `PAYMENT_PROVIDER=none` (환경 변수만 바꾸고 재배포) → 기존 무료 예약 흐름으로 돌아감
- 코드: `git revert`
- DB: 새 테이블만 추가하므로 기존 데이터에 영향이 없다. 되돌릴 때는 테이블을 남겨 둬도 동작에
  문제가 없다. DROP 마이그레이션은 test DB에서 먼저 실행해 본다.

## 리뷰 반영 (2026-11-21)

### 같은 슬롯 재준비

- 완료 조건 3의 "중복 prepare 거절" 은 이렇게 구현했다. 이전 시도가 pending 이면 failed 로 닫고
  선점을 이어받는다. confirming(승인 중)이면 거절한다.
- 이전 시도를 닫을 때 pending 인지 다시 확인한다. 읽은 뒤 승인 요청이 먼저 confirming 으로 바꿨으면
  덮어쓰지 않고 거절한다. 덮어쓰면 PG 승인은 끝났는데 예약도 환불도 없는 결제가 남는다.
- 테스트: `db-payment-repository.test.ts` 의 "prepare 가 pending 을 읽은 뒤 승인 선점이 먼저 커밋되면…"

### 환불 대기와 이용 완료가 겹칠 때

- 결제가 환불 대기(refund_pending)인 예약은 관리자가 이용 완료로 바꾸지 못한다(409, `not-usable`).
- 그래도 겹쳐서 예약은 이용 완료, 결제는 환불 대기로 남으면, 다음 취소(정리 cron 포함)가 같은 멱등키로
  환불을 끝내고 결제를 refunded 로 닫는다. 예약은 이용 완료로 둔다. 응답은 `not-cancellable` 과
  "결제는 환불되었습니다" 안내다.
- 테스트: `db-payment-repository.test.ts` 의 "환불 대기 중인 예약은 이용 완료로 바꾸지 않는다" 외 2건

### PG 승인 뒤 결제가 이미 닫혀 있을 때

- 예약 확정 시점에 결제가 paid·refund_pending 이면 다른 경로가 이미 확정한 것이라 그대로 둔다.
- 그 밖의 상태(failed·expired 등)면 돈만 나간 상태라 같은 멱등키(`refund-<결제 id>`)로 환불하고
  결제를 refunded 로 바꾼다.
- 이 환불까지 실패하면 결제는 failed 등으로 남고 정리 cron 대상이 아니다. 서버 로그
  "수동 환불 필요" 와 `failureReason` 의 `late-approval-refund-failed` 로 찾아 사람이 처리한다.
- 테스트: `db-payment-repository.test.ts` 의 "PG 승인 중에…" 2건

### 배포 순서

- 새 코드는 `PAYMENT_PROVIDER=none` 이어도 예약 취소·회원 탈퇴·정리 cron 에서 `payments` 테이블을 읽는다.
  테이블이 없는 DB 에 코드가 먼저 올라가면 모든 예약 취소와 탈퇴가 500 이 된다.
  이때는 `PAYMENT_PROVIDER=none` 으로 되돌려도 고쳐지지 않는다.
- 리뷰 반영(2026-11-21)과 2·3차 반영으로 `payments` 를 읽는 곳이 늘었다(4·5차 반영에서 정리).
  - 예약 상세 GET(`hasPendingRefund`): 테이블이 없으면 500.
  - 관리자 이용 완료 처리(`markReservationUsedInDb`): 테이블이 없으면 500(5차 반영에서 더함).
  - 슬롯 조회, 관리자 정원 변경(단건·일괄), 회원 탈퇴 전(`expireStalePaymentsBeforeRead`): 실패를 로그로 남기고
    계속 진행한다. 슬롯 조회와 정원 변경은 막히지 않는다. 탈퇴는 그 뒤 트랜잭션에서 결제를 다시 읽어 500.
  - 결제 준비(prepare)는 `PAYMENT_PROVIDER=toss` 일 때만 지난다.
- 올릴 때: 운영 DB 에 마이그레이션 `20261121120000_add_payments` 를 먼저 적용하고, 그다음 코드를 푸시한다.
- 내릴 때: 코드를 먼저 되돌리고(`git revert` 후 배포), 그다음 테이블을 지운다.

## 되돌릴 수 없는 피해를 줄이는 방법

- 테스트 키만 허용 (live 키는 코드에서 거부)
- 운영 DB에는 이번 작업에서 아무것도 하지 않음. 마이그레이션은 test DB와 dev DB에만 적용
- 결제 모드 켜기는 운영 마이그레이션 이후, 따로 승인

## 리뷰

구현이 끝나면 새 대화에서 이 계획과 diff로 리뷰한다(`/diff-review`).

## diff-review 반영 (2026-11-22)

- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API). DB 구조 변경 없음.
- 근거: 새 대화 리뷰(/diff-review) 결과 High 1, Medium 6, Low 5, 요구사항 누락 1. 승인 2026-11-22.

### 바꿀 것

1. [High] 이용 시각이 지난 결제는 예약으로 확정하지 않는다. `finalizeConfirmedPayment` 에서 슬롯 시작
   시각 <= 지금이면 예약을 만들지 않고 환불 → refunded + 정원 반환(`slot-started`). 시작 시각은
   `reservation-rules.ts` 의 기존 KST 파서로 계산한다(이 파일은 export 추가).
2. [Medium] PG 응답의 orderId 가 우리 결제와 다르면 취소를 보내지 않는다. confirming 으로 남기고
   `provider-order-mismatch` 기록 → 3번이 orderId 로 다시 조회해 정리. orderId 는 같고 금액만 다르면
   우리 주문이므로 지금처럼 환불.
3. [Medium] 정리 cron 은 사용자가 보낸 paymentKey 대신 우리 orderId 로 토스를 조회한다
   (`getPaymentByOrderId`, `GET /v1/payments/orders/{orderId}`). `NOT_FOUND_PAYMENT`(404) 면 우리 주문으로
   승인된 돈이 없으므로 failed + 정원 반환. 그 밖의 거절은 지금처럼 오류로 센다. IN_PROGRESS 결제의
   조회 결과는 토스 테스트 API 로 먼저 확인해 이 분기를 확정한다.
4. [Medium] 같은 결제를 두 곳이 동시에 확정하지 못하게, 정리 대상 하나를 처리하기 전에 조건부
   UPDATE(confirming + 1분 넘게 멈춤)로 선점한다. 선점 못 하면 건너뛴다. 환불로 넘어가기 전 결제 상태를
   다시 읽어 paid 면 취소하지 않는다.
5. [Medium] confirm 재요청 때 결제가 1분 넘게 confirming 이면 그 한 건을 cron 과 같은 방법으로 바로
   처리한다. 결과 화면 "처리 중" 상태에 "결과 다시 확인" 버튼을 둔다.
6. [Medium] 확정 실패 뒤 환불도 실패해 `finalize-failed`(또는 `slot-started`)로 남은 결제는 정리 cron 이
   확정하지 않고 환불만 다시 시도한다. "자동으로 취소될 예정" 안내와 동작을 맞춘다.
7. [Medium] `late-approval-refund-failed` 결제가 있으면 탈퇴를 막는다(수동 환불 근거 보존). 탈퇴 차단
   문구를 pending 만 있을 때와 그 밖으로 나눈다.
8. [Medium] 결제 결과 화면 버튼을 `ui/app-button` 의 `Button`·`ButtonLink` 로 바꾼다.
9. [Low] 쿼리에 amount 가 없거나 양의 정수가 아니면 confirm 을 보내지 않는다.
10. [Low] 실패 화면은 URL 의 `message` 를 표시하지 않고 code 와 고정 문구만 보여 준다.
11. [Low] 토스 결제창에 `customerName` 을 보내지 않는다.
12. [요구사항 누락] 이용약관 제4조 3항을 두 모드에서 모두 맞는 문장으로 바꾼다(`src/lib/notices.ts`,
    클라이언트도 읽으므로 환경 변수로 나누지 않음).
13. 정리 cron 에 처리 시간 한도(240초)를 두고 넘으면 다음 실행으로 넘긴다. route 에 `maxDuration = 300`.

### 안 바꿀 것

- `PAYMENT_PROVIDER=none` 일 때 prepare 가 정리 전에 404 를 돌려주는 동작. 되돌릴 때만 생기고 정리 cron 이
  하루 안에 푼다.
- 결제 모드의 409 중복 화면. 결제 없는 모드와 같이 서버 메시지를 보여 준다(reservation-form.tsx:461, :509).
- prepare rate limit, `test_ck_` 접두사 검사(계획보다 엄격한 쪽이라 유지).

### 완료 조건

1. 토스 테스트 API 확인(구현 전): orderId 조회의 DONE·IN_PROGRESS·없는 주문 응답, 다른 주문의 paymentKey 로
   confirm 한 응답, 같은 멱등키 재취소 응답. 입력과 응답을 아래 "토스 테스트 API 확인 기록" 에 남긴다.
2. 새 테스트(가짜 provider + test DB): 지난 슬롯 환불, orderId 불일치 시 취소 안 함, NOT_FOUND 시 failed,
   정리 겹침 시 한 곳만 처리, confirming 재확인 즉시 정리, finalize-failed 는 환불만, 수동 환불 대상 탈퇴 차단,
   처리 시간 한도.
3. 고친 곳마다 수정을 잠시 빼고 2 의 테스트가 실패하는지 확인한다.
4. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run test`(전체), `npm run build` 통과.
5. 브라우저(Playwright, 로컬 dev, 더미 계정): 결제 1회 → 예약 상세, 취소 → 환불, 결제창 닫기 → 실패 화면,
   CSP Report-Only 위반 0, 결과 화면 버튼 모양 눈 확인. 끝나면 더미 계정 삭제.

### 되돌리는 방법

- 이전 절과 같다(`PAYMENT_PROVIDER=none` 또는 `git revert`). 이번 묶음은 DB 구조를 바꾸지 않는다.

### 토스 테스트 API 확인 기록

- 2026-11-22, 테스트 시크릿 키(`test_sk_` 접두사, API 개별 연동 키), 스크립트로 직접 호출.
- 문서(https://docs.tosspayments.com/reference): `GET /v1/payments/orders/{orderId}` 는 "승인된 결제를 orderId로
  조회" 하며 Payment 객체를 돌려준다. 결제창형·위젯 키(`test_gsk`)로는 호출할 수 없다. 미승인(IN_PROGRESS)
  결제의 조회 결과는 문서에 없다.

| 요청 | 입력 | 응답 |
|---|---|---|
| `GET /v1/payments/orders/{orderId}` | 없는 orderId `ord_probe_nonexistent_20261122` | 404 `NOT_FOUND_PAYMENT` "존재하지 않는 결제 정보 입니다." |
| `GET /v1/payments/{paymentKey}` | 없는 paymentKey | 404 `NOT_FOUND_PAYMENT` (같은 문구) |
| `GET /v1/payments/orders/{orderId}` | 결제창을 열었다가 취소한 주문(인증 전) | 200, `status: READY`, paymentKey 있음, `method: null` |
| `POST /v1/payments/confirm` | 위 READY 결제의 paymentKey + 짝이 아닌 orderId `ord_probe_mismatch_20261122` | 404 `NOT_FOUND_PAYMENT_SESSION` "결제 시간이 만료되어 결제 진행 데이터가 존재하지 않습니다." |

- 문서와 다른 점: 승인되지 않은 결제도 orderId 로 조회된다(READY). 우리 코드는 READY 를 in-progress 로 보고
  confirming 을 유지하고, 토스가 만료(EXPIRED)시키면 not-approved 로 닫는다. 돈이 나가지 않은 상태로 처리되므로
  3번 설계는 그대로다(승인은 우리 서버만 보낼 수 있고, 정리는 승인 타임아웃 10초보다 긴 1분 뒤에 한다).
- 짝이 맞지 않는 승인 요청은 404 라 `rejected` 로 분류되어 결제를 failed 로 닫고 정원을 돌려준다.
- 확인 안 함: DONE 결제의 orderId 조회, 인증까지 마친(IN_PROGRESS) 결제의 조회, 같은 멱등키 재취소.
  토스 샌드박스에서도 카드 결제는 실제 카드사 앱 인증(예: vbv.shinhancard.com)이 떠서 헤드리스 브라우저로 끝낼 수 없다.
  사람이 로컬에서 결제 1회·취소 1회를 하면 확인할 수 있다.

### 검증 기록 (2026-11-22)

- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test` 전체: Test Files 128 passed, Tests 1209 passed.
  (Git Bash 에서 소문자 드라이브 경로 `c:/` 로 실행하면 모든 파일이 "Vitest failed to find the runner" 로 실패한다.
  `C:/` 로 이동해 실행해야 한다.)
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0. 로컬에는 관리자 비밀 값이 없어 빌드 전 검사를 건너뛰었다.
- 변이 확인: 고친 곳 8개(1·2·3·4·5·6·7·13번)를 하나씩 되돌리면 각각 해당 새 테스트 1건이 실패했다.
  복원 후 sha256 일치, 재실행 54 passed.
- 브라우저(Playwright 헤드리스, 로컬 dev, Firebase Admin 으로 만든 더미 계정 1개, 1440px):
  - 결제창 열기 → 신한 선택 → 인증 취소 → 결제 취소: 화면 "결제를 취소했습니다. 예약은 진행되지 않았습니다.",
    DB 결제 failed(`window:USER_CANCEL`), 예약 0건, 슬롯 reservedCount 0.
  - 실패 화면에 URL message 로 임의 문구를 넣어도 표시하지 않고 `(오류 코드: REJECT_CARD_COMPANY)` 만 보인다.
  - 성공 화면에 amount 가 없으면 "결제 결과 정보가 올바르지 않습니다" 를 보이고 승인 요청을 보내지 않는다.
  - "처리 중" 화면(승인 API 응답을 202 로 바꿔 넣어 화면만 확인): "결과 다시 확인" 버튼이 뜨고 누르면 승인 요청을
    다시 보낸다. 버튼은 공통 Button(primary·outline, 높이 48px, 모서리 8px).
  - 이용약관 제4조 3항이 새 문구로 보인다.
  - CSP Report-Only 기록 1,956건: dev 모드 webpack eval 1,949건, 토스 결제창 문서의 자체 정책 보고 7건
    (카드사 iframe frame-src 5건, form-action 2건). 우리 정책의 위반은 찾지 못했다. 운영 빌드에서는 확인 안 함.
  - 끝난 뒤 로그아웃, 더미 계정 삭제(Firebase `auth/user-not-found`, 로컬 프로필 0건).
- 사용자 직접 확인(2026-11-22, 로컬 dev, 더미 계정, 간편결제 2,400원, 일자산제1체육관 농구 2026-11-26 12:00):
  - dev 로그: `POST /api/payments/prepare 201` → `POST /api/payments/confirm 201` → 예약 상세 →
    `DELETE /api/reservations/{id} 200`. 서버 오류 로그 없음.
  - 로컬 DB: 결제 refunded(failureReason 없음, reservationId 연결), 예약 cancelled, 슬롯 reservedCount 0.
  - 토스 `GET /v1/payments/orders/{orderId}`: 200, `status: CANCELED`, `method: 간편결제`, totalAmount 2400.
  - 같은 멱등키(`refund-<orderId>`)로 다시 취소: 200, `status: CANCELED`(앞의 결과를 그대로 돌려줌, 두 번 환불 안 됨).
  - 다른 멱등키로 다시 취소: 400 `ALREADY_CANCELED_PAYMENT` "이미 취소된 결제 입니다."
    (우리 코드는 이 코드를 받으면 조회로 canceled 를 확인해 성공으로 본다.)
- 확인 안 함: DONE 상태일 때의 orderId 조회 응답(취소 뒤에 조회해 CANCELED 만 봤다), 인증까지 마친 IN_PROGRESS 결제의
  조회 응답, 관리자 화면의 환불 실패(502) 문구.

## diff-review 2차 반영 (2026-11-22)

- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API). DB 구조 변경 없음.
- 근거: 새 대화 리뷰(/diff-review, 수정 27개 + 새 파일 25개) 결과 High 1, Medium 6, Low 5, 요구사항 누락 2.
  High 와 취소 재시도 지적은 코드를 열어 맞는지 확인했다. 나머지는 리뷰 보고를 근거로 한다.
- 상태: 승인됨(2026-11-22). 관리자 취소 알림은 넣지 않기로 함

### 바꿀 것

1. [High] 만료된 선점(pending, 15분 경과)을 정원을 읽는 곳에서 먼저 푼다. 지금은 prepare(오래된 순 20건)와
   하루 1회 cron 에서만 풀려, 결제창을 닫고 떠난 선점이 최대 하루 동안 슬롯을 "마감" 으로 보이게 한다.
   - `expireStalePayments` 에 범위 조건(시설·종목·날짜, 또는 사용자)을 받는 인자를 더한다.
   - 부르는 곳: 슬롯 조회(`listReservationSlotAvailabilities`, 그 시설·종목·날짜), prepare(대상 슬롯. 기존 전역
     20건 정리는 유지), 관리자 정원 변경 2곳(`updateReservationSlotPolicy`·`updateReservationSlotPolicies`, 대상 날짜),
     탈퇴 검사 직전(그 사용자).
   - 정리가 실패하면 로그를 남기고 본 요청은 그대로 진행한다(prepare 와 같다). 탈퇴는 정리가 실패해도
     기존 검사가 그대로 막으므로 안전한 쪽으로 남는다.
2. [Medium] 결제가 환불 대기(refund_pending)인 예약은 사용자 취소의 마감(이용 2시간 전) 검사를 건너뛴다.
   환불이 이미 시작된 건을 끝내는 것이라 새 취소를 허용하는 것이 아니다. 계획의 "다시 누르면 같은 멱등키로
   재요청" 을 마감 뒤에도 지킨다. 결제가 paid(환불 시작 전)인 예약은 지금처럼 마감 뒤 취소를 거절한다.
3. [Medium] 수동 환불 대상(`late-approval-refund-failed`)의 confirm 응답을 새 상태 `manual-refund-required`, 409 로
   바꾼다. 화면은 "다시 시도" 버튼 없이 고객센터 안내만 보인다. 확정 실패 뒤 환불 실패(`finalize-failed`·
   `slot-started`)는 정리 cron 이 다시 환불하므로 지금처럼 502 와 다시 시도를 유지한다.
4. [Medium] 관리자 취소가 "환불은 됐지만 예약은 이용 완료라 취소 안 됨" 으로 끝나면 감사 기록을 남긴다.
   저장소 결과에 이 경우를 구분하는 값을 더하고, 관리자 route 가 새 action `reservation.refund`("결제 환불")를
   기록한다. 응답(409)과 사용자 경로 동작은 바꾸지 않는다.
5. [Medium] 예약이 없을 수 있는 상황에서 "내 예약에서 확인" 을 안내하는 문구 4곳을 고친다.
   "잠시 뒤 결과를 다시 확인" 또는 "고객센터로 문의" 로 바꾼다.
   - `db-payment-repository.ts:317`(선점 실패), `payments/confirm/route.ts:99`, `payment-client.ts:149`,
     `withdrawal-service.ts:96`
   - `db-payment-repository.ts:426`·`:573` 은 결제가 paid·refund_pending 이라 예약이 있으므로 그대로 둔다.
6. [Medium] 정리 cron 은 결제 한 건을 처리할 때마다 그 시점의 시각(시작 시각 + 경과 시간)을 쓴다.
   선점 시각(`updatedAt`)과 이용 시작 판단이 실행 시작 시각에 묶여, 사용자의 재확인과 같은 결제를 겹쳐
   처리하는 일을 막는다. 경과 시간은 이미 있는 `clock` 인자로 재므로 테스트는 시각을 주입할 수 있다.
7. [Medium] 예약 확정 때 PG 응답의 `paymentKey` 로 `providerPaymentKey` 를 갱신한다. 이후 환불은 브라우저가
   보낸 값이 아니라 PG 가 돌려준 값을 쓴다.
8. [Low] 정리 cron 이 환불 대기 건을 처리해 예약이 실제로 취소되면 예약 취소 알림을 보낸다(사용자 취소 경로와 같다).
   `reconcilePayments` 에 알림 함수를 인자로 받는다(기본값 `notifyReservationEvent`). 알림 실패는 정리 결과에
   영향을 주지 않는다.
9. [Low] 정리 요약에 `skipped`(다른 요청이 이미 처리 중)를 따로 센다. 지금은 `stillPending` 에 섞인다.
10. [Low] 테스트용 가짜 provider 는 모르는 paymentKey 로 취소하면 `NOT_FOUND_PAYMENT` 거절을 돌려준다.
    이 동작에 기대던 테스트가 있으면 결제를 만든 뒤 취소하도록 고친다.
11. [Low] 정리
    - 홈 안내 `reservationHold` 의 "10분" 을 "15분" 으로 바꾼다(한·영).
    - `src/lib/payment.ts` 의 쓰지 않는 `PAYMENT_STATUSES`·`isPaymentStatus`(와 다른 곳에서 안 쓰면 `PaymentStatus`)를 지운다.
12. [요청하지 않은 파일] `load-test/runs/2026-11-11-booking-race.md` 는 결제 커밋에 넣지 않는다. 파일은 그대로 둔다.

### 안 바꿀 것

- 내 예약 화면에 결제 상태 표시. 새 화면이 필요한 기능이라 이번 범위 밖이다.
- 관리자 취소의 Slack 알림. 이번 변경 전부터 없다. 넣을지는 따로 정한다.
- DB 구조, 마이그레이션.
- `PAYMENT_PROVIDER=none` 일 때의 동작. 범위 정리는 결제 기록이 없으면 아무것도 바꾸지 않는다.

### 완료 조건

1. 새 테스트(가짜 provider + test DB):
   - 만료된 pending 이 마지막 정원을 잡은 슬롯을 조회하면 `available` 로 돌아오고 결제는 expired 가 된다.
   - 오래된 만료 선점이 21건 이상 있어도 prepare 가 대상 슬롯의 만료 선점을 풀고 선점에 성공한다.
   - 만료 선점만 있는 슬롯은 관리자가 정원을 줄일 수 있다(단건·일괄).
   - 만료된 pending 만 있는 사용자는 탈퇴할 수 있다. 만료 전 pending 이면 지금처럼 막힌다.
   - 취소 마감이 지난 refund_pending 예약을 다시 취소하면 환불과 취소가 끝난다. 마감이 지난 paid 예약은 거절된다.
   - 수동 환불 대상 결제의 confirm 은 409 `manual-refund-required`.
   - 관리자 취소가 환불만 끝나면 감사 기록 1건(`reservation.refund`).
   - 정리 cron 이 시간이 지난 뒤 처리한 결제의 선점 시각은 그 시점의 시각이다.
   - 확정 뒤 `providerPaymentKey` 가 PG 응답 값이다.
   - 정리 cron 이 환불 대기 예약을 취소하면 알림 1회, 실패하면 0회.
   - 정리 요약의 `skipped`.
   - 가짜 provider 의 모르는 키 취소 거절.
2. 고친 곳마다 수정을 잠시 빼고 1 의 테스트가 실패하는지 확인한다(문구·정리 11번 제외).
3. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run test`(전체, `C:/` 경로에서), `SKIP_ADMIN_ENV_CHECK=1 npm run build` 통과.
4. 사용자 눈 확인 항목: 없음. 화면 변화는 3번(버튼 없음)과 문구뿐이고 route 테스트와 diff 로 본다.
   브라우저 확인은 하지 않는다.

### 되돌리는 방법

- 이전 절과 같다(`PAYMENT_PROVIDER=none` 또는 `git revert`). DB 구조를 바꾸지 않는다.
- 범위 정리(1번)는 이미 있던 만료 정리를 더 자주 부르는 것이라, 되돌려도 남는 데이터가 없다.

### 리뷰

구현 뒤 새 대화에서 이 절과 diff 로 다시 리뷰한다(`/diff-review`).

### 검증 기록 (2026-11-22, 2차 반영)

- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test` 전체(`C:/` 경로): Test Files 128 passed, Tests 1228 passed.
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0.
- 변이 확인: 고친 곳 13개(1번 5곳, 2·3·4·6·7·8·9·10번)를 하나씩 되돌리면 각각 해당 새 테스트 1건이 실패했다.
  복원 후 sha256 일치. 처음에는 1번의 prepare 변이를 테스트가 잡지 못했다. 테스트가 오래된 선점 20건을
  먼저 만들어서, 앞선 준비 요청이 그 20건을 지워 버렸기 때문이다. 20건을 뒤에 만들도록 고친 뒤 잡혔다.
- 구현 중 계획과 달라진 점:
  - 만료 정리(`expireStalePayments`, `closePaymentAndReleaseSlot`)를 `db-payment-repository.ts` 에서
    `db-reservation-repository.ts` 로 옮겼다. 슬롯 조회와 정원 변경이 이 파일에 있고, payment 쪽이 이미
    reservation 쪽을 import 하므로, 반대 방향 import(순환)를 만들지 않기 위해서다.
  - 4번의 새 action 은 `src/lib/admin/audit-log.ts` 에 더했다(라벨 "결제 환불").
- 확인 안 함: 브라우저 화면(계획대로 하지 않음), 운영 DB.

## diff-review 3차 반영 (2026-11-22)

- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API). DB 구조 변경 없음.
- 근거: 2차 반영 뒤 새 대화 리뷰(/diff-review) 결과 Critical·High 0, Medium 3, Low 3.
- 상태: 승인됨(2026-11-22). M2 는 (a) 버튼을 보이게 한다로 결정.

### 바꿀 것

1. [M1] 결제가 failed 이고 `failureReason` 이 `late-approval-refund-failed` 로 시작하면, 같은 confirm 을 다시 보내도
   `manual-refund-required`(409)를 돌려준다. 새로고침한 사용자에게 "다시 예약" 안내가 나가지 않게 한다.
2. [M2] 예약 상세 API 가 결제가 환불 대기(refund_pending)인지 함께 보고, 그렇다면 취소 마감이 지났어도
   `canCancel: true` 로 내려준다. 서버가 이미 허용하는 재취소를 화면에서 할 수 있게 한다.
   파일: `src/lib/reservation-detail.ts`, `src/app/api/reservations/[reservationId]/route.ts`(+ 필요하면 조회 함수).
3. [M3] 정리 cron 이 시간이 지난 뒤 선점한 결제의 `updatedAt` 이 그 시점의 시각인지 검사하는 테스트를 더한다.
4. [L1] 확정·보상 경로에서 결제가 refunded 면 "내 예약에서 확인" 대신 "잠시 뒤 결과를 다시 확인" 을 안내한다
   (refunded 결제에는 예약이 없을 수 있다).
5. [L2] 같은 승인 재요청 판정에서 저장된 결제키(확정 뒤 PG 값)뿐 아니라 브라우저가 처음 보낸 키도 같은 승인으로 본다.
6. [L3] 결제 결과 화면은 `manual-refund-required` 일 때 "내 예약 보기" 버튼을 숨기고 고객센터 안내만 보인다.
   파일: `src/components/reservation/payment-result-view.tsx`.
7. [테스트] 기본 알림 함수(실제 Slack 전송)를 쓰는 정리 cron 테스트에 아무것도 하지 않는 알림 대역을 넣는다.
   로컬 `.env.local` 설정에 따라 결과가 달라지거나 외부로 메시지가 나가는 일을 없앤다.

### 안 바꿀 것

- 관리자 개요의 슬롯 집계(`getAdminReservationOverview`). 리뷰 지적 아님, 계획 밖.
- DB 구조, 결제 상태 표시 화면.

### 완료 조건

1. 새 테스트: 수동 환불 대상 confirm 재요청도 409 `manual-refund-required` / 환불 대기 예약은 마감 뒤에도
   상세의 `canCancel` 이 true, 환불 대기가 아니면 지금처럼 false / cron 선점 시각 / refunded 결제의 안내 문구 /
   PG 키와 다른 브라우저 키로 재요청해도 `already-confirmed`.
2. 고친 곳마다 수정을 잠시 빼고 1 의 테스트가 실패하는지 확인한다(6·7번 제외. 6번은 화면이라 diff 로 본다).
3. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run test`(전체, `C:/` 경로), `SKIP_ADMIN_ENV_CHECK=1 npm run build` 통과.

### 되돌리는 방법

- 이전 절과 같다(`PAYMENT_PROVIDER=none` 또는 `git revert`). DB 구조를 바꾸지 않는다.

### 검증 기록 (2026-11-22, 3차 반영)

- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test` 전체(`C:/` 경로): Test Files 128 passed, Tests 1233 passed.
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0.
- 변이 확인: M1, M2(상세 분기·route 전달 2곳), M3, L2 를 하나씩 되돌리면 각각 해당 새 테스트 1건이 실패했다.
  복원 후 sha256 일치.
- 구현 중 계획과 달라진 점:
  - L2: 브라우저 키를 따로 저장하지 않고, paid 결제의 재요청에서 결제키 비교를 뺐다. 본인 결제(userId 검사)이고
    PG 를 다시 부르지 않으므로 키가 달라도 같은 예약을 돌려줘도 된다.
  - L3: 화면이 상태를 구분하도록 `src/lib/payment-client.ts` 의 실패 결과에 응답 본문 status(`code`)를 더했다.
  - L1: 보상 경로에서 결제가 refunded 로 바뀐 순간을 가짜 PG 로 만들 수 없어 테스트를 넣지 않았다. 문구 분기는 diff 로 본다.
    (정정, 4차 반영: 틀린 판단이었다. 가짜 PG 의 `getPaymentByOrderId` 를 덮어써 만들 수 있다. 4차에서 테스트를 더했다.)
  - 7번: 알림 대역은 `db-payment-repository.test.ts` 와 `cron/payment-reconcile/route.test.ts` 두 곳에 넣었다.
- 확인 안 함: 브라우저 화면(L3 버튼 숨김 포함), 운영 DB.

## diff-review 4차 반영 (2026-11-22)

- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API). DB 구조 변경 없음.
- 근거: 3차 반영 뒤 새 대화 리뷰(/diff-review) 결과 Critical·High 0, Medium 3, Low 4.
  그리고 테스트 실행 중 실제 Slack 메시지 2건이 나간 사고(2026-11-22 16:02, "테스트 체육관 · 배드민턴 · 2026-11-29 10:00"
  취소 알림). 원인: 테스트 프로세스에 `SLACK_WEBHOOK_URL` 이 들어 있었고, 2차 반영에서 더한 정리 cron 취소 알림의 기본값이
  실제 전송 함수였다. 3차 반영의 알림 대역은 두 테스트 파일만 막았다.
  (정정, 6차 반영: 값의 출처는 `.env.local` 이 아니라 Windows 사용자 환경 변수였다. 아래 6차 절 참고.)
- 상태: 승인 (2026-11-22, 사용자가 Slack webhook 교체 뒤 승인)

### 바꿀 것

1. [사고·Medium 3] 테스트 실행에서 외부로 나가는 값을 한 곳에서 지운다. `tests/setup-env.ts` 에서
   `SLACK_WEBHOOK_URL`, `TOSS_SECRET_KEY`, `TOSS_CLIENT_KEY`, `PAYMENT_PROVIDER` 를 지운다.
   - 같은 이유로 외부 호출에 쓰는 다른 값(예: AI API 키, Google 계정 키)이 있는지 서버 코드의 `process.env` 를 grep 해
     표로 보고하고, 테스트가 필요로 하지 않는 것은 함께 지운다.
   - 값이 필요한 테스트는 지금처럼 `vi.stubEnv` 로 직접 넣는다. 지운 뒤 실패하는 테스트는 직접 넣도록 고친다.
   - 정리 cron route 테스트의 "처리하지 못한 결제" 경우는 가짜 PG(조회 결과 모름)를 넣어 환경 변수와 상관없이
     errors 1 이 되게 하고, 틀린 주석("결제키 없이 PG 조회를 할 수 없어")을 고친다.
2. [Medium 1] 확정 경로(`finalizeConfirmedPayment`)에서 결제가 이미 refunded 면 PG 에 취소를 다시 보내지 않고
   "잠시 뒤 결과를 다시 확인" 을 돌려준다(보상 경로와 같은 처리).
   - M1 검사(수동 환불 안내)는 결제 상태가 failed·expired 일 때만 적용한다. 이미 환불된 결제에 수동 환불 안내가 나가지 않게 한다.
3. [Medium 2] L1(refunded 결제 안내)에 테스트를 더한다. 가짜 PG 의 `getPaymentByOrderId` 를 덮어써 그 안에서 결제를
   refunded 로 바꾼 뒤 done 을 돌려주는 방법이다. 변이 확인도 한다. 3차 검증 기록의 "가짜 PG 로 만들 수 없어" 는
   틀린 판단이었다고 바로잡는다.
4. [Low] 정리 cron 은 처리 결과가 ok 가 아닐 때 결제를 다시 읽어, 이미 confirming 이 아니면(다른 경로가 처리함)
   skipped 로 센다. 그대로 confirming 이면(orderId 불일치 등) 지금처럼 errors 로 센다.
5. [Low] 환불된 결제의 confirm 재요청은 "이미 환불된 결제입니다. 예약은 진행되지 않았습니다." 로 안내한다
   (`not-pending` 상태 유지, 문구만 구분). processing 화면의 "내 예약 보기" 버튼은 둔다. paid·refund_pending 인
   processing 은 예약이 있기 때문이다.
6. [Low] "환불 대기면 마감 뒤 취소 허용" 판정을 `hasPendingRefund` 하나로 모은다. `cancelReservationInDb` 도 이 함수를 쓴다.
7. [Low] 이 문서의 "배포 순서" 절에 payments 테이블을 읽는 곳(예약 상세 GET, 슬롯 조회, 관리자 정원 변경)을 더한다.

### 안 바꿀 것

- Slack webhook 값과 채널. 사용자가 `.env.local` 과 Vercel 값을 직접 확인·교체한다(코드 밖).
- DB 구조, 결제 상태 표시 화면, 관리자 개요의 슬롯 집계.

### 완료 조건

1. 1번 적용 뒤 테스트 전체를 돌리는 동안 Slack 채널에 새 메시지가 오지 않는다(사용자 눈 확인).
   지울 값의 grep 결과 표를 보고에 붙인다.
2. 새 테스트: refunded 결제가 확정 경로에서 PG 취소를 다시 보내지 않음 / refunded 결제에 수동 환불 안내가 안 나감 /
   L1 보상 경로 문구 / cron 이 다른 경로가 처리한 결제를 skipped 로 셈 / 환불된 결제의 재요청 문구.
3. 2~6번을 하나씩 되돌리면 해당 새 테스트가 실패한다(7번 문서, 1번은 완료 조건 1로 본다).
4. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run test`(전체, `C:/` 경로), `SKIP_ADMIN_ENV_CHECK=1 npm run build` 통과.

### 되돌리는 방법

- 이전 절과 같다(`PAYMENT_PROVIDER=none` 또는 `git revert`). DB 구조를 바꾸지 않는다.
- 1번은 테스트 설정만 바꾼다. 운영·dev 실행에는 영향이 없다.

### 검증 기록 (2026-11-22, 4차 반영)

- 1번에서 지운 값. 서버 코드(`src`, 테스트 제외)의 `process.env` 를 grep 해 외부 서비스를 부르는 값을 골랐다.
  `.env.test.local` 에는 `DATABASE_URL`, `DIRECT_URL` 만 있다.

  | 값 | 읽는 파일 | 외부 서비스 |
  | --- | --- | --- |
  | `SLACK_WEBHOOK_URL` | `notify-slack.ts` | Slack |
  | `PAYMENT_PROVIDER`, `TOSS_SECRET_KEY`, `TOSS_CLIENT_KEY` | `payment/payment-config.ts` | 토스 |
  | `ANTHROPIC_API_KEY` | `ai-brief.ts`, `faq-bot.ts` | Anthropic |
  | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID` | `sheets-ledger.ts` | Google Sheets |
  | `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | `firebase-admin.ts` | Firebase |
  | `SUPABASE_SERVICE_ROLE_KEY` | `supabase-storage.ts` | Supabase Storage |
  | `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | `oauth/*-provider.ts` | 카카오·네이버 |
  | `NEXT_PUBLIC_FIREBASE_API_KEY` (5차에서 더함) | `firebase-password-verify.ts` | Google Identity Toolkit |

  지우지 않은 값: `CRON_SECRET`, `ADMIN_PAGE_*`, `DEMO_USER_UID`, `RATE_LIMIT_HMAC_SECRET`,
  `NEXT_PUBLIC_FIREBASE_API_KEY` 를 뺀 `NEXT_PUBLIC_*`, `*_REDIRECT_URI` (외부 호출 인증에 쓰지 않음).
  (정정, 5차 반영: `NEXT_PUBLIC_FIREBASE_API_KEY` 는 서버 `firebase-password-verify.ts` 가 Google Identity Toolkit 을
  부를 때 쓴다. 5차에서 지울 값에 더했다.)
- 1번 확인: 테스트 설정(vitest.config + setup 파일)으로 16개 키가 비어 있는지 검사하는 확인용 테스트를 저장소 밖에서 돌렸다.
  지금 상태는 통과. `tests/setup-env.ts` 의 지우는 줄을 잠시 빼면 실패하고 남은 키는 `SLACK_WEBHOOK_URL` 하나였다
  (사고 원인과 같음). 복원 후 sha256 일치. 값은 출력하지 않았다.
- 1번 확인(사용자 눈): 전체 테스트(20:27:12~20:28:58) 동안 Slack 새 메시지 여부. → 새 메시지 없음(사용자 확인, 2026-11-22).
- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test` 전체(`C:/` 경로): Test Files 128 passed, Tests 1239 passed.
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0.
- 변이 확인 7건. 각각 변이 전 해당 테스트 통과 → 변이 후 실패, 복원 후 sha256 일치.
  2a 확정 경로 refunded / 2b 수동 환불 안내 상태 조건 / 3 L1 보상 경로 / 4a cron skipped / 4b cron confirming 이면 errors /
  5 환불된 결제 재요청 문구 / 6 `cancelReservationInDb` 의 `hasPendingRefund`(기존 테스트 "마감 뒤에도 다시 취소" 가 잡음).
- 구현 중 계획과 달라진 점:
  - 4번: "ok 가 아닐 때" 가 아니라 `processing` 일 때만 다시 읽는다. `manual-refund-required` 도 결제가 confirming 이
    아니지만(failed·expired) 사람이 봐야 하므로 errors 로 남겨야 한다.
  - 5번: 환불된 결제에 예약이 있었으면(결제 후 사용자가 취소) "이미 환불된 결제입니다. 예약은 취소되었습니다." 로 안내한다.
    계획의 "예약은 진행되지 않았습니다" 는 예약이 없던 경우에만 맞다.
- 확인 안 함: 브라우저 화면, 운영 DB.

## diff-review 5차 반영 (2026-11-22)

- 변경의 종류: 되돌릴 수 없는 변경 (돈·외부 API). DB 구조 변경 없음.
- 근거: 4차 반영 뒤 새 대화 리뷰(/diff-review) 결과 Critical·High 0, Medium 3, Low 5.
- 상태: 승인 (2026-11-22)

### 바꿀 것

1. [Medium] 회원 탈퇴의 수동 환불 검사도 결제 상태가 failed·expired 일 때만 막는다(4차 2번과 같은 기준).
   `withdrawal-service.ts` 의 `failureReason startsWith late-approval-refund-failed` 조건에 상태 조건을 더한다.
   사람이 환불을 마쳐 refunded 로 바꾼 결제는 탈퇴를 막지 않는다.
2. [Medium] `NEXT_PUBLIC_FIREBASE_API_KEY` 도 테스트에서 지운다. 서버 `firebase-password-verify.ts` 가 이 값으로
   Google Identity Toolkit 을 부른다. 지운 뒤 실패하는 테스트가 있으면 `vi.stubEnv` 로 가짜 값을 넣는다.
   4차 검증 기록의 "지우지 않은 값" 설명(`NEXT_PUBLIC_*` 는 외부 호출 인증에 쓰지 않음)을 고친다.
3. [Medium] 정리 cron 이 `manual-refund-required` 결제를 errors 로 세는지 검사하는 테스트를 더한다
   (4차 "계획과 달라진 점" 4번의 근거). 변이 확인: 조건을 `!output.ok` 로 바꾸면 실패해야 한다.
4. [Low] confirm 재요청 문구를 상태에 맞춘다(`not-pending` 상태 유지).
   - refunded, 예약 있음: "이미 환불된 결제입니다. 내 예약에서 상태를 확인해 주세요."
     (예약은 취소됐을 수도, 환불만 끝나고 이용 완료로 남았을 수도 있다)
   - refunded, 예약 없음: 지금처럼 "이미 환불된 결제입니다. 예약은 진행되지 않았습니다."
   - refund_pending: "환불이 진행 중인 결제입니다. 내 예약에서 상태를 확인해 주세요."
5. [Low] `npm run test:unit`(`vitest.unit.config.ts`)도 같은 차단을 거치게 한다. 먼저 이 실행기에서 `.env.local` 값이
   process.env 에 들어가는지 4차와 같은 확인용 테스트로 본다. 들어가면 `setupFiles` 에 `tests/setup-env.ts` 를 넣는다.
   들어가지 않으면 바꾸지 않고 그 결과를 기록한다.
6. [Low] 문서 "배포 순서" 에 관리자 이용 완료 처리(`markReservationUsedInDb`, 테이블이 없으면 500)를 더한다.
7. [Low] cron route 테스트 "처리하지 못한 결제" 의 주석을 검사하는 내용(상태가 confirming 으로 남음)에 맞춘다.

### 안 바꿀 것

- DB 구조, 화면 코드, 결제 상태 표시 화면, 4차까지의 다른 동작.

### 완료 조건

1. 새 테스트: refunded 인 수동 환불 결제는 탈퇴를 막지 않음(failed 인 것은 계속 막음) / cron 이 manual-refund-required 를
   errors 로 셈 / refunded(예약 있음)·refund_pending 재요청 문구.
2. 1·3·4번을 하나씩 되돌리면 해당 새 테스트가 실패한다.
3. 2번: 확인용 테스트로 테스트 실행 중 17개 키가 비었는지 본다. 5번: 확인 결과(값은 출력하지 않음, 키 이름만)를 기록한다.
4. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run test`(전체, `C:/` 경로), `npm run test:unit`,
   `SKIP_ADMIN_ENV_CHECK=1 npm run build` 통과.

### 되돌리는 방법

- 이전 절과 같다(`PAYMENT_PROVIDER=none` 또는 `git revert`). DB 구조를 바꾸지 않는다.
- 2·5·7번은 테스트 설정·주석만 바꾼다. 운영·dev 실행에는 영향이 없다.

### 검증 기록 (2026-11-22, 5차 반영)

- 5번 확인: 확인용 테스트(저장소 밖)를 `vitest.unit.config.ts` 로 돌리니, 바꾸기 전에는 `SLACK_WEBHOOK_URL` 이 남아 있었다.
  그래서 `setupFiles` 에 `tests/setup-env.ts` 를 넣었다. 값은 출력하지 않았다(키 이름만).
- 2·5번 확인: 17개 키(4차 16개 + `NEXT_PUBLIC_FIREBASE_API_KEY`)가 비었는지 보는 확인용 테스트가 `vitest.config.ts`,
  `vitest.unit.config.ts` 두 설정에서 모두 통과. 키를 지운 뒤 실패해 고친 기존 테스트는 없었다.
- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test:unit`: Test Files 28 passed, Tests 248 passed.
- `npm run test` 전체(`C:/` 경로, 20:51:44~20:53:25): Test Files 128 passed, Tests 1242 passed.
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0.
- 변이 확인 4건. 각각 변이 전 해당 테스트 통과 → 변이 후 실패, 복원 후 sha256 일치.
  1 탈퇴 검사의 상태 조건 제거 / 3 cron 조건을 `!output.ok` 로 바꿈 / 4a refunded(예약 있음) 문구를 4차 문구로 되돌림 /
  4b refund_pending 분기 제거.
- 4차 테스트 "결제한 예약을 취소해 환불된 결제로…" 는 4번 문구 변경에 맞춰 기대 문구와 이름을 바꿨다.
- 확인 안 함: 브라우저 화면, 운영 DB.

## diff-review 6차 반영 (2026-11-22)

- 변경의 종류: 기존 테스트로 확인되는 변경(동작 변경 없음: 주석·문서 정정, 항상 참인 조건 제거) + 회귀 테스트 추가.
  탈퇴 판정 정리는 `withdrawal-service.test.ts` 의 "결제 진행 중(정원 선점)이면…", "돈이 나갔는데 자동 환불이 실패한…" 이 확인한다.
- 근거: 5차 반영 뒤 새 대화 리뷰(/diff-review) 결과 Critical·High 0, Medium 1, Low 3.
- 상태: 사용자 승인(2026-11-22, 새 파일 `tests/external-env-guard.test.ts` 경로 포함).

### 바꾼 것

1. [Medium] 사고 원인 정정. 테스트에 들어온 `SLACK_WEBHOOK_URL` 은 `.env.local` 이 아니라 Windows 사용자 환경 변수에서 왔다.
   확인(값은 출력 안 함): 사용자 범위 있음, 시스템 범위 없음. `.env.local` 에 있는 `ANTHROPIC_API_KEY`,
   `NEXT_PUBLIC_FIREBASE_API_KEY` 는 4·5차 확인용 테스트에서 테스트 프로세스에 들어오지 않았다.
   `tests/setup-env.ts`, `vitest.unit.config.ts` 주석과 이 문서 4차 절의 원인 문장을 고쳤다.
2. [Low] `withdrawal-service.ts` 의 `onlyHolds` 에서 항상 참인 조건(pending 결제의 수동 환불 사유 검사)을 뺐다.
3. [Low] 문서: "배포 순서" 의 시기 표기, 4차 검증 기록 표에 `NEXT_PUBLIC_FIREBASE_API_KEY` 행 추가.
4. 회귀 테스트 `tests/external-env-guard.test.ts`. 테스트 프로세스에 17개 키가 남아 있지 않음 /
   가짜 값을 넣고 setup-env 를 다시 실행하면 모두 지워짐(이 PC 의 환경 변수와 상관없이 검사됨).
   `vitest.unit.config.ts` 의 include 에도 넣었다.

### 코드 밖에서 사용자가 할 일

- Windows 사용자 환경 변수 `SLACK_WEBHOOK_URL` 정리(시스템 환경 변수 편집 → 사용자 변수). 이 값이 있으면 로컬 dev 서버와
  `dotenv -e .env.local` 스크립트가 `.env.local` 값 대신 이 값을 쓸 수 있다(추정, 실행 안 함: 둘 다 이미 있는 환경 변수를 덮어쓰지 않음).
  장기 프로젝트가 이 값을 쓰는지 먼저 확인한다. 정리 뒤 VS Code·터미널을 다시 켠다.

### 검증 기록 (2026-11-22, 6차 반영)

- 변이 확인: `tests/setup-env.ts` 의 지우는 줄을 빼면 새 테스트 2건이 모두 실패. 복원 후 sha256 일치.
- `npx tsc --noEmit --pretty false` exit 0, `npm run lint` exit 0.
- `npm run test:unit`: Test Files 29 passed, Tests 250 passed.
- `npm run test` 전체(`C:/` 경로, 21:25:02~21:26:54): Test Files 129 passed, Tests 1244 passed.
- `SKIP_ADMIN_ENV_CHECK=1 npm run build` exit 0.
- 확인 안 함: 로컬 dev 서버가 실제로 사용자 환경 변수 webhook 으로 보내는지, 브라우저 화면, 운영 DB.

## 운영 DB 마이그레이션 (2026-11-22)

- 되돌리기 리허설(test DB, 로컬 Docker `gym_reservation_test`):
  1. `prisma migrate status` → "Database schema is up to date!" (19 migrations)
  2. 되돌리기 SQL 실행(`prisma db execute`): `DROP TABLE IF EXISTS "payments";` +
     `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261121120000_add_payments';` → "Script executed successfully."
  3. status → "Following migration have not yet been applied: 20261121120000_add_payments"
  4. `npm run db:test:migrate` → "Applying migration `20261121120000_add_payments`", "All migrations have been successfully applied."
  5. status → up to date. 결제·탈퇴 테스트 2 files / 83 tests 통과.
- 운영 되돌리기: 코드를 먼저 되돌려 배포한 뒤(`git revert`) 위 되돌리기 SQL 을 운영에 실행한다. 순서가 바뀌면 예약 취소·탈퇴·예약 상세가 500.
- 운영 적용: 사용자가 PowerShell 에서 운영 주소를 직접 넣고 `npm run db:migrate:prod` 실행(주소는 Claude 가 보지 않음).
  적용 전 `prisma migrate status` 로 대기 중인 마이그레이션이 이것 하나인지 본다.
- 운영 적용 결과(2026-11-22 21:58, Claude 가 `.env.production.local` 로 실행, 값·호스트는 출력하지 않음):
  - 적용 전 status: 미적용 `20261121120000_add_payments` 하나뿐.
  - `prisma migrate deploy`: "All migrations have been successfully applied." exit 0.
  - 적용 뒤 status: "Database schema is up to date!"
  - 읽기 전용 조회: payments 행 0, RLS 켜짐 true, 인덱스 6(기본키 + 마이그레이션의 5개).
