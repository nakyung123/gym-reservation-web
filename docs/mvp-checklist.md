# MVP 체크리스트

## 완료

- `/`, `/gyms`, `/gyms/[id]`, `/reserve/[gymId]`, `/reservations` 라우트 구현
- mock 체육관 데이터 기반 추천, 목록, 상세 화면 구현
- 검색, 종목 필터, 가까운 순, 낮은 가격순, 이름순 정렬 구현
- 종목, 날짜, 시간 선택 예약 폼 구현
- 예약 가능 여부와 중복 예약 방지 규칙 분리
- Firebase Auth 통합 로그인 (이메일·Google·카카오·네이버)
- Postgres(Prisma) 기반 예약 생성, 조회, 취소 구현
- `reservation_locks` UNIQUE 제약으로 활성 예약 중복 생성 방지
- 사용자별 예약 조회와 서버 ID 토큰 검증 적용
- 예약 내역 필터, 취소 확인, 모바일 입장권 UI 구현
- 체육관 데이터 조회 provider 분리 (mock | db)
- 현재 시설 목록에서 제외된 옛 예약 내역 안내 표시
- GitHub Actions CI에서 lint, build 검증

## 출시 전 확인

- `npm run lint` 통과
- `npm run build` 통과
- `http://localhost:3000` 기준 주요 라우트 수동 확인
- 새 예약 생성 후 Postgres `reservations`, `reservation_locks` 행 확인
- 같은 시간대를 다시 예약할 때 중복 예약 안내 확인
- 예약 취소 후 입장권 비활성화와 lock 삭제 확인
- 서울 샘플 데이터 정리 전에 만든 예약이 안내 문구와 함께 표시되는지 확인
- 모바일 화면에서 목록, 상세, 예약, 예약 내역 흐름 확인

## MVP 이후 후보

- 확장 기능 목록은 [캡스톤 기능 확장 백로그](capstone-feature-backlog.md)를 기준으로 관리
- 관리자용 체육관, 시간대, 휴관일 관리 화면 추가
- 실제 QR 값 생성과 현장 검증 흐름 설계
- Firebase Hosting 또는 Vercel 배포 자동화
- 예약 완료 알림, 캘린더 저장 같은 편의 기능 추가
