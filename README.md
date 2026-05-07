# 공공체육관 예약 웹

대학 캡스톤에서 기획하고 디자인했던 공공체육관 예약 앱 아이디어를 바탕으로
새로 구현하는 Next.js 웹 프로젝트입니다.

기존 캡스톤 프로젝트는 팀 프로젝트였고, 당시 담당 역할은 서비스 기획,
사용자 흐름 설계, 앱 전체 UI/UX 디자인이었습니다. 이 저장소는 개발자
포트폴리오를 위해 새로 구현하는 개인 프로젝트이며, 기존 Flutter 코드는
재사용하지 않습니다.

현재 데이터는 서울 공공체육시설을 참고한 MVP 샘플입니다. 화면에서 생성한
예약은 실제 시설 예약으로 접수되지 않습니다.

## MVP 범위

- 서울 공공체육시설 추천, 목록, 상세 정보 확인
- 체육관 검색, 지역구 필터, 종목 필터, 정렬
- 종목, 날짜, 시간 선택
- Firebase Auth 익명 세션 기반 예약 생성과 조회
- Firestore transaction 기반 중복 예약 방지
- 예약 취소와 모바일 입장권 확인

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Firebase Auth
- Cloud Firestore
- GitHub Actions

## 프로젝트 문서

- [제품 개요](docs/product-brief.md)
- [라우트 설계](docs/routes.md)
- [데이터 모델](docs/data-model.md)
- [스프린트 계획](docs/sprint-plan.md)
- [Firebase 연결 계획](docs/firebase-plan.md)
- [Firestore 보안 규칙](docs/firestore-rules.md)
- [Firestore 체육관 초기 데이터](docs/firestore-gyms-seed.md)
- [MVP 체크리스트](docs/mvp-checklist.md)
- [캡스톤 기능 확장 백로그](docs/capstone-feature-backlog.md)
- [배포 계획](docs/deployment-plan.md)

## 환경변수

`.env.example`을 기준으로 `.env.local`을 만들고 Firebase 웹 앱 설정값을
입력합니다.

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_GYM_DATA_SOURCE=mock
```

Firebase Analytics를 쓰지 않기 때문에 `measurementId`는 현재 필수값이
아닙니다.

`NEXT_PUBLIC_GYM_DATA_SOURCE`는 체육관 데이터 원본을 고릅니다. 기본값은
`mock`이고, Firestore `gyms` 컬렉션과 공개 읽기 규칙을 준비한 뒤
`firestore`로 바꿉니다.

## Firestore 체육관 seed

초기 체육관 데이터는 `src/data/gyms.json`을 기준으로 합니다. Firebase Admin
SDK 서비스 계정 키를 준비한 뒤 아래 명령으로 Firestore `gyms` 컬렉션에
저장합니다.

```bash
npm run seed:gyms -- --service-account "C:\path\to\service-account.json" --prune
```

서비스 계정 키는 절대 커밋하지 않습니다. 자세한 절차는
[Firestore 체육관 초기 데이터](docs/firestore-gyms-seed.md)를 봅니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증

```bash
npm run lint
npm run build
```

GitHub Actions CI도 `main` 브랜치 push와 pull request에서 같은 검증을
실행합니다.

## 개발 원칙

- SSOT: 예약 규칙, 저장소 선택, Firebase 설정의 기준 파일을 분리합니다.
- SRP: UI, 예약 규칙, 저장소 구현, Firebase 초기화를 역할별로 나눕니다.
- 일관성: 화면 copy와 상태 표현을 같은 기준으로 유지합니다.
- 원자성: 예약 생성과 취소는 Firestore transaction으로 처리합니다.
- 멱등성: 이미 취소된 예약 취소처럼 반복 요청해도 안전한 흐름을 유지합니다.
- 말없는 fallback 금지: Firebase 실패 시 localStorage로 조용히 바꾸지 않습니다.
