# 배포 계획

## 현재 결론

MVP 배포는 Vercel을 우선 후보로 둡니다.

이 프로젝트는 Next.js 16 앱이고 GitHub Actions CI에서 이미 `lint`와
`build`를 검증하고 있습니다. Vercel은 Next.js 배포 설정이 가장 단순하며,
운영 DB는 Vercel Storage 통합으로 Supabase Postgres(Seoul region)를 사용하고,
Firebase Auth는 클라이언트 SDK + Admin SDK로 계속 사용합니다 (Firestore는 미사용).

## 후보 비교

| 후보 | 장점 | 주의점 | 판단 |
| --- | --- | --- | --- |
| Vercel | Next.js 배포가 단순하고 GitHub 연동이 빠름 | Vercel 프로젝트 환경변수를 별도로 입력해야 함 | MVP 추천 |
| Firebase Hosting | Firebase 콘솔 안에서 관리 가능 | Next.js SSR/라우팅 배포 구성이 Vercel보다 번거로움 | 이후 검토 |
| GitHub Pages | 정적 파일 호스팅이 단순함 | Next.js 앱 라우팅과 Firebase 환경 설정 관리가 어색함 | 비추천 |

## 배포 전 준비

- GitHub `main` 브랜치 기준 CI 통과 확인
- Vercel 프로젝트 연결
- Vercel Environment Variables에 `.env.local`과 같은 공개 Firebase 설정값 입력
- 배포 URL을 Firebase Authentication 승인 도메인에 추가
- 배포 URL에서 예약 생성, 중복 예약 안내, 예약 취소 흐름 수동 확인

## 환경변수

Firebase 웹 앱 설정값은 브라우저에 노출되는 `NEXT_PUBLIC_*` 값입니다. 그래도
저장소에는 `.env.local`을 올리지 않고, 배포 플랫폼의 환경변수 설정에만
입력합니다.

필수값:

```bash
# Firebase 클라이언트
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (서버 ID 토큰 검증)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# 데이터 백엔드 (기본 db. 옛 NEXT_PUBLIC_*_DATA_SOURCE는 폐기 — provider에서 throw)
NEXT_PUBLIC_GYM_DATA_BACKEND=db
NEXT_PUBLIC_FAVORITE_DATA_BACKEND=db
NEXT_PUBLIC_RESERVATION_DATA_BACKEND=db

# Postgres (Vercel은 Supabase 통합의 POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING을 매핑)
DATABASE_URL=
DIRECT_URL=
```

운영 DB에 migration / seed 적용 절차는 `data-source-status.md`의 "운영 DB 작업 절차" 섹션을 따릅니다 (`npm run db:migrate:prod` / `db:seed:prod`).
