# 데이터 모델

## 컬렉션

### users

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | string | 인증 uid |
| email | string | 로그인 이메일 |
| displayName | string | 사용자 이름 |
| createdAt | timestamp | 생성일 |

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
| description | string | 상세 설명 |

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
| createdAt | timestamp | 생성일 |

## 예약 규칙

같은 사용자는 동일한 체육관, 종목, 날짜, 시간에 대해 중복 활성 예약을
생성할 수 없습니다. 지난 시간대 예약도 막아야 합니다.
