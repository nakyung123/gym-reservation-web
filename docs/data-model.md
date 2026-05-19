# 데이터 모델

## 컬렉션

### users

MVP 이후 로그인 기능을 붙일 때 추가할 후보 컬렉션입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 인증 uid |
| provider | string | `kakao`, `naver`, `email` 등 로그인 제공자 |
| providerUserId | string | 제공자별 사용자 id |
| email | string | 제공자가 내려주는 이메일. 없을 수 있음 |
| displayName | string | 사용자 이름 |
| createdAt | timestamp | 생성일 |

MVP에서는 별도 `users` 문서를 만들지 않고 Firebase Auth 익명 세션의
`auth.uid`를 사용자 식별 기준으로 사용합니다. 카카오, 네이버 같은 소셜
로그인은 베타 전 사용자 정책을 정한 뒤 확장 후보로 둡니다.

### gyms

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 체육관 id |
| name | string | 체육관 이름 |
| region | string | 검색과 필터 기준 지역 |
| address | string | 표시 주소 |
| officialUrl | string | 공식 시설 안내 URL |
| openHours | string | 운영시간 |
| basePrice | number | 기본 예약 금액 |
| sports | string[] | 이용 가능한 종목 |
| sportPrices | map | 종목별 예약 금액 |
| facilities | string[] | 편의시설 |
| availableTimes | string[] | 예약 가능한 시간대 |
| closedDays | string[] | 휴관 요일 |
| distanceKm | number | 현재 기준 거리 |
| description | string | 상세 설명 |

현재 `gyms` seed/mock 데이터의 기준 파일은 `src/data/gyms.json`이고,
`src/lib/mock-data.ts`는 이 JSON을 앱의 mock 체육관 데이터로 노출합니다.
화면은 `src/lib/gym-repository-provider.ts`를 통해 체육관 데이터를 읽고,
기본값은 `db`(Postgres) 백엔드입니다. `NEXT_PUBLIC_GYM_DATA_BACKEND=mock`을
설정하면 JSON 기반 mock 저장소를 씁니다 (시연/dev 용도). 현재 seed 데이터는
서울 공공체육시설 샘플이며, 실제 예약 가능 시간과 요금은 운영기관 공지에 따라
달라질 수 있습니다.

### reservations

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 예약 id |
| userId | string | 예약자 uid |
| gymId | string | 예약 체육관 |
| sport | string | 선택 종목 |
| date | string | `YYYY-MM-DD` |
| time | string | `HH:mm` |
| price | number | 최종 금액 |
| status | string | `reserved`, `cancelled`, `used` |
| createdAt | string | ISO 생성 시각 |
| activeKey | string | 활성 중복 예약 방지 키 |

`Reservation` 도메인 타입에는 `activeKey`를 포함하지 않습니다. Postgres
저장 시 중복 활성 예약 방지를 위해 repository 계층에서만 추가합니다
(`reservation_locks.active_key` UNIQUE 제약).

### reservationLocks

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| activeKey | string | lock 문서 id와 같은 활성 예약 키 |
| reservationId | string | 연결된 예약 id |
| status | string | `reserved` |
| updatedAt | string | ISO 갱신 시각 |

`reservation_locks`는 동일 사용자, 체육관, 종목, 날짜, 시간의 활성 예약이
동시에 여러 개 생성되지 않도록 막는 테이블입니다. 예약 생성과 취소는 Prisma
`$transaction` 안에서 `reservations`, `reservation_slots`, `reservation_locks`를
함께 처리합니다 (`mysql-reservation-repository.ts` — historical 파일명, 현재는
Postgres-backed).

## 예약 규칙

같은 사용자는 동일한 체육관, 종목, 날짜, 시간에 대해 중복 활성 예약을
생성할 수 없습니다. 지난 시간대 예약도 막아야 합니다.

예약 규칙의 코드 기준은 `src/lib/reservation-rules.ts`이고, 활성 중복 예약
키 생성 기준은 `src/lib/reservation-repository.ts`의
`getReservationActiveKey`입니다.
