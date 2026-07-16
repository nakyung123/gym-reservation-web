# 데이터 모델

최종 갱신: 2026-05-19

이 문서는 현재 Prisma schema 기준의 운영 데이터 모델을 요약한다. 운영 SSOT는 Supabase Postgres이고, 로컬 dev/test는 Docker Postgres를 사용한다. Firebase Auth는 사용자 인증과 uid 발급만 담당하며, 앱 전용 사용자 설정은 `user_profiles`에 저장한다.

## 저장소 경계

- Prisma schema: `prisma/schema.prisma`
- DB 접근 경계: `src/lib/server/db-*-repository.ts`
- 화면/클라이언트 저장소 선택: `src/lib/*-repository-provider.ts`
- seed/mock 기준 체육관 데이터: `src/data/gyms.json`

Firestore 운영 분기와 MySQL 전용 repository는 제거됐다. 옛 `NEXT_PUBLIC_*_DATA_SOURCE` 환경 변수가 살아 있으면 provider 초기화 단계에서 명시적으로 실패한다.

## 주요 테이블

### gyms

체육관 기본 정보 테이블이다.

| 필드 | 설명 |
| --- | --- |
| `id` | 체육관 id |
| `name`, `region`, `address` | 표시/검색/지역 필터 기준 |
| `official_url`, `open_hours` | 공식 안내 URL과 운영 시간 |
| `base_price` | 기본 예약 금액 |
| `description` | 상세 설명 |
| `latitude`, `longitude` | 사용자 현재 위치 기반 거리 계산의 SSOT |
| `sport_prices`, `facilities`, `available_times`, `closed_days` | JSON 기반 가변 설정 |
| `is_active` | 운영 노출 여부 |

종목 필터/검색에 자주 쓰이는 `sports`는 `gym_sports`로 정규화한다.

### gym_sports

체육관별 지원 종목 테이블이다. `(gym_id, sport)` 복합 PK를 사용한다.

### favorites

사용자 즐겨찾기 테이블이다. `user_id`는 Firebase Auth uid이며, `(user_id, gym_id)` 복합 PK로 같은 체육관 중복 즐겨찾기를 막는다.

### user_profiles

Firebase Auth uid에 연결되는 앱 전용 프로필/설정 테이블이다.

| 필드 | 설명 |
| --- | --- |
| `user_id` | Firebase Auth uid |
| `nickname` | 가입 시 자동 생성되는 내부 unique 값. 현재 사용자에게 노출·편집되지 않으며 문의 표시명 최후 폴백 등에만 쓰인다 |
| `provider` | 표시/통계용 로그인 provider. 권한 판단에는 사용하지 않는다 |
| `preferred_region` | 선호 지역 |
| `preferred_sports` | 선호 종목 JSON |
| `reservation_notifications_enabled` | 예약 알림 설정 |

`provider`는 서버가 Firebase ID token의 `sign_in_provider`, uid prefix, custom claims를 기준으로 산출한다. 클라이언트 입력값은 신뢰하지 않는다.

### reservations

예약 본체 테이블이다.

| 필드 | 설명 |
| --- | --- |
| `id` | 예약 id |
| `user_id` | 예약자 Firebase Auth uid |
| `gym_id`, `sport`, `date`, `time` | 예약 슬롯 식별 정보 |
| `price` | 최종 예약 금액 |
| `status` | `reserved`, `cancelled`, `used` |
| `active_key` | 같은 사용자·체육관·종목·일자·시간의 활성 중복 예약 방지 키 |

예약 생성/취소/이용 완료는 `src/lib/server/db-reservation-repository.ts`의 transaction 경계 안에서 처리한다.

### reservation_locks

같은 사용자 같은 슬롯의 활성 예약을 1건으로 제한하는 락 테이블이다. `active_key`를 PK로 사용해 중복 예약을 DB 제약으로 감지한다.

### reservation_slots

체육관·종목·일자·시간별 정원과 예약 수를 저장한다. `(gym_id, sport, date, time)` 복합 PK를 사용한다. 예약 생성 시 `reserved_count < capacity` 조건부 update로 정원 초과를 방지한다.

### withdrawal_reasons

회원 탈퇴 사유 통계 테이블이다. 탈퇴한 사용자의 uid는 저장하지 않고, category/detail/created_at만 남긴다.

### oauth_attempts

카카오/네이버 OAuth authorize 요청을 추적하는 단기 store다. `/start`에서 발급한 state를 저장하고 `/callback`에서 1회 소비한다. 만료된 행은 진입 시 opportunistic cleanup한다.

### auth_handover_tickets

카카오/네이버 OAuth callback 이후 Firebase custom token handover를 제어하는 단기 ticket 테이블이다.

상태 머신은 `pending -> token_issued -> signed_in -> finalized`이다. `handover_nonce`는 HttpOnly cookie와 매칭해 ticket 단독 탈취를 방어하고, `profile_payload`는 provider profile snapshot을 저장해 finalize 단계에서 Firebase user record 동기화에 사용한다. 토큰류는 저장하지 않는다.

## 예약 원자성

예약 생성은 `reservations`, `reservation_slots`, `reservation_locks`를 하나의 transaction에서 갱신한다. 실패를 mock/local 데이터로 조용히 대체하지 않으며, DB 제약 충돌은 사용자에게 명확한 오류로 전달한다.

## 거리 계산

체육관 좌표는 `gyms.latitude`/`gyms.longitude`가 SSOT다. 화면에 표시하는 거리는 저장 필드가 아니라 사용자 현재 위치와 체육관 좌표를 이용해 계산한다.
