# 공공체육관 예약 웹

대학 캡스톤에서 기획하고 디자인했던 공공체육관 예약 앱 아이디어를 바탕으로
새로 구현하는 Next.js 웹 프로젝트입니다.

기존 캡스톤 프로젝트는 팀 프로젝트였고, 당시 담당 역할은 서비스 기획,
사용자 흐름 설계, 앱 전체 UI/UX 디자인이었습니다. 이 저장소는 개발자
포트폴리오를 위해 새로 구현하는 개인 프로젝트이며, 기존 Flutter 코드는
재사용하지 않습니다.

현재 데이터는 서울 공공체육시설을 참고한 MVP 샘플입니다. 화면에서 생성한
예약은 실제 시설 예약으로 접수되지 않습니다.

## 주요 기능

- 서울 공공체육시설 목록, 검색, 지역구/종목 필터, 정렬
- 체육관 상세 정보, 종목별 이용료, 운영 시간대 확인
- Firebase Auth 익명 세션 기반 사용자 식별
- MySQL/Prisma 기반 예약 생성, 조회, 취소
- 예약 슬롯 정원 관리와 중복 활성 예약 방지
- 즐겨찾기 저장
- 모바일 입장권 형태의 예약 내역 확인
- 관리자 예약 관리, 슬롯 관리, 시설 관리

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- MySQL
- Prisma
- Firebase Auth
- Vitest
- GitHub Actions

## 데이터 구조

기본 저장소는 MySQL입니다. Firebase Auth는 사용자 식별에 사용하고,
Firestore 어댑터는 legacy 옵션으로 보존합니다.

| 도메인 | 기본 저장소 | 가능한 옵션 | 환경 변수 |
|---|---|---|---|
| 체육관 | MySQL | `mock` / `firestore` / `mysql` | `NEXT_PUBLIC_GYM_DATA_SOURCE` |
| 즐겨찾기 | MySQL | `local` / `mysql` | `NEXT_PUBLIC_FAVORITE_DATA_SOURCE` |
| 예약 | MySQL | `firestore` / `mysql` | `NEXT_PUBLIC_RESERVATION_DATA_SOURCE` |

## 환경 변수

`.env.local`에 Firebase 웹 앱 설정, MySQL 연결 정보, 관리자 API 토큰을
설정합니다. 실제 값은 커밋하지 않습니다.

```bash
DATABASE_URL=
ADMIN_API_TOKEN=

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

NEXT_PUBLIC_GYM_DATA_SOURCE=mysql
NEXT_PUBLIC_FAVORITE_DATA_SOURCE=mysql
NEXT_PUBLIC_RESERVATION_DATA_SOURCE=mysql
```

Firebase Analytics를 쓰지 않기 때문에 `measurementId`는 현재 필수값이
아닙니다.

## 로컬 실행

```bash
npm install
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 관리자 화면

관리자 화면은 `http://localhost:3000/admin`에서 진입합니다.

- `/admin/reservations`: 예약 조회, 이용 완료, 관리자 취소
- `/admin/reservation-slots`: 날짜/종목/시간대별 정원과 마감 상태 관리
- `/admin/gyms`: 시설 추가, 수정, 활성/비활성 관리

관리자 API 요청에는 `.env.local`의 `ADMIN_API_TOKEN`과 같은 값을 화면에
저장해야 합니다. 토큰은 브라우저 `sessionStorage`에만 저장됩니다.

## 검증

```bash
npx tsc --noEmit --pretty false
npm run lint
npm run test
npm run build
```

Windows에서 dev server가 Prisma 엔진 파일을 잡고 있으면 `npm run build`의
`prisma generate` 단계가 `EPERM`으로 실패할 수 있습니다. 이 경우 dev server를
종료한 뒤 다시 실행합니다.

## 프로젝트 문서

- [제품 개요](docs/product-brief.md)
- [라우트 설계](docs/routes.md)
- [데이터 모델](docs/data-model.md)
- [데이터 소스 현황](docs/data-source-status.md)
- [스프린트 계획](docs/sprint-plan.md)
- [MVP 체크리스트](docs/mvp-checklist.md)
- [캡스톤 기능 확장 백로그](docs/capstone-feature-backlog.md)
- [배포 계획](docs/deployment-plan.md)
- [Firebase 연결 계획](docs/firebase-plan.md)
- [Firestore 보안 규칙](docs/firestore-rules.md)
- [Firestore 체육관 초기 데이터](docs/firestore-gyms-seed.md)
