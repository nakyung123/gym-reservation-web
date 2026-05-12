# 라우트 설계

## 현재 라우트

| 라우트 | 목적 | 우선순위 |
| --- | --- | --- |
| `/` | 서비스 진입 화면과 추천 체육관 | P0 |
| `/gyms` | 체육관 목록과 검색 | P0 |
| `/gyms/[id]` | 체육관 상세와 예약 진입 | P0 |
| `/reserve/[gymId]` | 날짜, 시간, 종목 선택과 예약 생성 | P0 |
| `/reservations` | 내 예약과 QR 입장권 | P0 |
| `/reservations/[reservationId]` | 예약 상세와 모바일 입장권 | P0 |
| `/login` | 베타 전 로그인 정책 확정 후 추가 | P1 |
| `/profile` | 사용자 프로필 요약 | P2 |

## 관리자 라우트와 API

| 라우트 | 목적 |
| --- | --- |
| `/admin` | 관리자 기능 진입 |
| `/admin/reservations` | 예약 목록 조회와 상태 변경 |
| `/admin/reservation-slots` | 날짜, 종목, 시간대별 슬롯 관리 |
| `/admin/gyms` | 시설 추가, 수정, 활성/비활성 관리 |
| `GET /api/admin/reservations/[reservationId]` | 관리자 예약 단건 조회 |
| `PATCH /api/admin/reservations/[reservationId]` | 관리자 예약 이용 완료/취소 |
| `PATCH /api/admin/reservation-slots/bulk` | 관리자 슬롯 일괄 변경 |

## 핵심 사용자 흐름

`/gyms` -> `/gyms/[id]` -> `/reserve/[gymId]` -> `/reservations` -> `/reservations/[reservationId]`

## 현재 구현 기준

체육관 데이터는 `src/data/gyms.json`을 seed/mock 기준으로 사용하고, 기본 저장소는
MySQL/Prisma입니다. 예약 생성, 조회, 상세 조회, 취소는 Firebase Auth 익명 세션의
ID token을 검증한 뒤 MySQL repository를 통해 처리합니다.

관리자 예약 목록과 상세 조회, 상태 변경은 관리자 API token을 검증한 뒤 처리합니다.
슬롯 관리는 날짜, 종목, 시간대 단위의 단건 변경과 현재 조회 날짜 기준 일괄 변경을
지원합니다.

로그인, 회원가입, 프로필 화면은 이후 확장 후보입니다.
프로토타입 단계에서는 익명 세션을 유지하고, 소셜 로그인은 카카오를 우선
후보로 검토합니다.
