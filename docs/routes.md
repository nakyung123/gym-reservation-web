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
| `/login` | 이메일/Google/카카오/네이버 로그인 | P0 |
| `/signup` | 이메일 회원가입 | P0 |
| `/reset-password` | 비밀번호 재설정 요청 | P1 |
| `/verify-email` | 이메일 인증 안내 | P1 |
| `/auth/handover` | 카카오/네이버 custom token handover | P0 |
| `/mypage` | 내 정보, 예약/즐겨찾기 요약, 프로필 설정 | P0 |
| `/mypage/password` | 비밀번호 변경 | P1 |
| `/mypage/withdraw` | 회원 탈퇴 | P1 |

## 관리자 라우트와 API

| 라우트 | 목적 |
| --- | --- |
| `/admin` | 관리자 기능 진입 |
| `/admin/reservations` | 예약 목록 조회와 상태 변경 |
| `/admin/reservation-slots` | 날짜, 종목, 시간대별 슬롯 관리 |
| `/admin/gyms` | 시설 추가, 수정, 활성/비활성 관리 |
| `GET /api/admin/overview` | 관리자 대시보드 요약 |
| `GET /api/admin/gyms` | 관리자 시설 목록 조회 |
| `POST /api/admin/gyms` | 관리자 시설 생성 |
| `PATCH /api/admin/gyms/[gymId]` | 관리자 시설 수정 |
| `GET /api/admin/reservations/[reservationId]` | 관리자 예약 단건 조회 |
| `PATCH /api/admin/reservations/[reservationId]` | 관리자 예약 이용 완료/취소 |
| `PATCH /api/admin/reservation-slots` | 관리자 슬롯 단건 변경 |
| `PATCH /api/admin/reservation-slots/bulk` | 관리자 슬롯 일괄 변경 |

## 인증과 사용자 API

| 라우트 | 목적 |
| --- | --- |
| `POST /api/auth/kakao/start` | 카카오 OAuth 시작 |
| `GET /api/auth/kakao/callback` | 카카오 OAuth callback 처리 |
| `POST /api/auth/kakao/token` | handover ticket을 custom token으로 교환 |
| `POST /api/auth/kakao/finalize` | 카카오 로그인 후 프로필 동기화와 handover 종료 |
| `POST /api/auth/naver/start` | 네이버 OAuth 시작 |
| `GET /api/auth/naver/callback` | 네이버 OAuth callback 처리 |
| `POST /api/auth/naver/token` | handover ticket을 custom token으로 교환 |
| `POST /api/auth/naver/finalize` | 네이버 로그인 후 프로필 동기화와 handover 종료 |
| `GET /api/me` | 내 정보 요약 |
| `GET /api/me/profile` | 내 프로필 조회 |
| `POST /api/me/profile` | 내 프로필 생성/초기화 |
| `PUT /api/me/profile` | 내 프로필 저장 |
| `GET /api/me/nickname-availability` | 닉네임 사용 가능 여부 확인 |
| `PUT /api/me/profile-photo` | 프로필 사진 저장/삭제 |
| `POST /api/me/withdraw` | 회원 탈퇴 |

## 예약과 즐겨찾기 API

| 라우트 | 목적 |
| --- | --- |
| `GET /api/reservations` | 내 예약 목록 조회 |
| `POST /api/reservations` | 예약 생성 |
| `GET /api/reservations/[reservationId]` | 내 예약 상세 조회 |
| `DELETE /api/reservations/[reservationId]` | 내 예약 취소 |
| `GET /api/favorites` | 내 즐겨찾기 목록 조회 |
| `PUT /api/favorites/[gymId]` | 즐겨찾기 추가 |
| `DELETE /api/favorites/[gymId]` | 즐겨찾기 제거 |
| `GET /api/reservation-slots` | 예약 가능 슬롯 조회 |

## 핵심 사용자 흐름

`/gyms` -> `/gyms/[id]` -> `/reserve/[gymId]` -> `/reservations` -> `/reservations/[reservationId]`

## 현재 구현 기준

체육관 데이터는 `src/data/gyms.json`을 seed/mock 기준으로 사용하고, 기본 저장소는
Supabase Postgres/Prisma입니다. 운영 DB 접근 경계는 `src/lib/server/db-*-repository.ts`이고,
화면/클라이언트 계층의 저장소 선택은 `src/lib/*-repository-provider.ts`를 통합니다.

예약 생성, 조회, 상세 조회, 취소는 Firebase Auth ID token을 검증한 뒤 Postgres repository를
통해 처리합니다. 익명 로그인 흐름은 제거됐고, 사용자는 이메일/Google/카카오/네이버 계정으로
로그인한 뒤 예약·즐겨찾기·마이페이지 기능을 사용합니다.

관리자 예약 목록과 상세 조회, 상태 변경은 관리자 API token을 검증한 뒤 처리합니다.
슬롯 관리는 날짜, 종목, 시간대 단위의 단건 변경과 현재 조회 날짜 기준 일괄 변경을
지원합니다.

카카오/네이버 로그인은 full redirect OAuth 후 `/auth/handover`에서 Firebase custom token으로
전환합니다. custom token과 handover ticket은 서버 route에서 검증하고, 실패를 mock/local 데이터로
조용히 대체하지 않습니다.
