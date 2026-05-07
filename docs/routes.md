# 라우트 설계

## MVP 라우트

| 라우트 | 목적 | 우선순위 |
| --- | --- | --- |
| `/` | 서비스 진입 화면과 추천 체육관 | P0 |
| `/gyms` | 체육관 목록과 검색 | P0 |
| `/gyms/[id]` | 체육관 상세와 예약 진입 | P0 |
| `/reserve/[gymId]` | 날짜, 시간, 종목 선택과 예약 생성 | P0 |
| `/reservations` | 내 예약과 QR 입장권 | P0 |
| `/login` | 로그인과 회원가입 | P1 |
| `/profile` | 사용자 프로필 요약 | P2 |

## 핵심 사용자 흐름

`/gyms` -> `/gyms/[id]` -> `/reserve/[gymId]` -> `/reservations`

## 현재 구현 기준

체육관 데이터는 아직 mock 데이터를 사용합니다. 예약 생성, 조회, 취소는
Firebase Auth 익명 세션과 Cloud Firestore를 기준으로 동작합니다.

로그인, 회원가입, 프로필 화면은 MVP 이후 확장 후보입니다.
