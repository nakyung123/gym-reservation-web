# 데이터 모델

## 컬렉션

### users

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 인증 uid |
| email | string | 로그인 이메일 |
| displayName | string | 사용자 이름 |
| createdAt | timestamp | 생성일 |

MVP에서는 별도 `users` 문서를 만들지 않고 Firebase Auth 익명 세션의
`auth.uid`를 사용자 식별 기준으로 사용합니다. 로그인과 회원가입을 붙일 때
확장 후보로 둡니다.

### gyms

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 체육관 id |
| name | string | 체육관 이름 |
| region | string | 검색과 필터 기준 지역 |
| address | string | 표시 주소 |
| openHours | string | 운영시간 |
| basePrice | number | 기본 예약 금액 |
| sports | string[] | 이용 가능한 종목 |
| sportPrices | map | 종목별 예약 금액 |
| facilities | string[] | 편의시설 |
| availableTimes | string[] | 예약 가능한 시간대 |
| closedDays | string[] | 휴관 요일 |
| distanceKm | number | 현재 기준 거리 |
| description | string | 상세 설명 |

현재 `gyms` 데이터는 `src/lib/mock-data.ts`가 기준입니다. Firestore 이전 전까지
화면과 예약 흐름은 mock 체육관 데이터를 사용합니다.

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

`Reservation` 도메인 타입에는 `activeKey`를 포함하지 않습니다. Firestore
저장 시 중복 활성 예약 방지와 보안 규칙 검증을 위해 repository 계층에서만
추가합니다.

### reservationLocks

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| activeKey | string | lock 문서 id와 같은 활성 예약 키 |
| reservationId | string | 연결된 예약 id |
| status | string | `reserved` |
| updatedAt | string | ISO 갱신 시각 |

`reservationLocks`는 동일 사용자, 체육관, 종목, 날짜, 시간의 활성 예약이
동시에 여러 개 생성되지 않도록 막는 컬렉션입니다. 예약 생성과 취소는
Firestore transaction 안에서 `reservations`와 `reservationLocks`를 함께
처리합니다.

## 예약 규칙

같은 사용자는 동일한 체육관, 종목, 날짜, 시간에 대해 중복 활성 예약을
생성할 수 없습니다. 지난 시간대 예약도 막아야 합니다.

예약 규칙의 코드 기준은 `src/lib/reservation-rules.ts`이고, 활성 중복 예약
키 생성 기준은 `src/lib/reservation-repository.ts`의
`getReservationActiveKey`입니다.
