# 데이터 소스 현황

최종 갱신: 2026-05-19

## 결론

- **운영 SSOT는 Supabase Postgres** (Seoul region). 로컬 dev/test는 Docker Postgres 17.
- Prisma 6를 통한 단일 어댑터(`src/lib/server/db-*-repository.ts`)가 모든 도메인의 DB 접근 경계다.
- **mock / local 어댑터는 개발·시연 보조용**으로 유지한다.
- **Firestore 운영 분기는 폐기**됐다. 옛 환경변수 `NEXT_PUBLIC_*_DATA_SOURCE`는 런타임에서 명시적으로 throw해 사고 재발을 막는다.
- **Firebase Auth는 유지**된다 (이메일/Google + 카카오·네이버 custom token). Firestore와 독립.

## 도메인별 현황

| 도메인 | 기본 백엔드 | 가능한 옵션 | 환경 변수 |
|---|---|---|---|
| 체육관 (gym) | db (Postgres) | `mock` / `db` | `NEXT_PUBLIC_GYM_DATA_BACKEND` |
| 즐겨찾기 (favorite) | db (Postgres) | `local` / `db` | `NEXT_PUBLIC_FAVORITE_DATA_BACKEND` |
| 예약 (reservation) | db (Postgres) | `mock` / `db` | `NEXT_PUBLIC_RESERVATION_DATA_BACKEND` |

기본값은 모두 `db`. 명시하지 않으면 db로 동작한다. 선택 로직은 `src/lib/*-repository-provider.ts`에 있다.

옛 변수 (`NEXT_PUBLIC_GYM_DATA_SOURCE` 등)가 환경에 살아 있으면 provider 초기화 단계에서 throw한다. 조용한 호환을 두지 않는 이유는 2026-05-19 Vercel 빌드 사고(Firestore 데이터에 lat/lng 없어 형식 검증 실패) 때문이다.

## Firebase Auth는 왜 남는가

| 파일 | 역할 |
|---|---|
| `src/lib/firebase-app.ts` | Firebase 앱 초기화 |
| `src/lib/firebase-client.ts` | `getAuth` (Firestore 의존 제거됨) |
| `src/lib/firebase-auth-session.ts` | 클라이언트 세션 + 토큰 관리 |
| `src/lib/server/firebase-admin.ts` | 서버 ID 토큰 검증, 사용자 삭제 |

- db 모드에서도 사용자 식별은 Firebase Auth uid를 그대로 쓴다.
- `api-*-repository`는 Firebase ID 토큰을 헤더로 보내고, 서버 라우트는 `verifyIdTokenFromRequest`로 검증한다.
- Firestore 의존을 완전히 분리했으므로 Firestore 어댑터 제거가 Auth에 영향을 주지 않는다.

## mock / local은 왜 남는가

- `mockGymRepository` (`gym-repository.ts` + `mock-data.ts`): `src/data/gyms.json`만 있으면 DB 연결 없이도 화면을 띄울 수 있다. 디자인 검토/신규 환경 셋업 첫 단계에서 유용.
- `mockReservationRepository` (`mock-reservation-repository.ts`): in-memory. 페이지 새로고침 시 휘발. 시연용.
- `localStorageFavoriteRepository`: 로그인 없이 즐겨찾기 토글 가능. 로컬 환경에서 진입 장벽 제거.

## 운영 DB 작업 절차 (Supabase Postgres)

```powershell
# 1. 운영 URL을 PowerShell 세션에 임시 주입 (값은 외부 노출 금지)
$env:DATABASE_URL = '<POSTGRES_PRISMA_URL>'
$env:DIRECT_URL   = '<POSTGRES_URL_NON_POOLING>'

# 2. 운영 전용 스크립트 (PRISMA_ENV=production 마커가 .env.local override를 건너뛴다)
npm run db:migrate:prod   # 운영 DB에 migration 적용
npm run db:seed:prod      # 운영 DB에 gym 시드

# 3. 끝나면 변수 비우기
$env:DATABASE_URL = $null
$env:DIRECT_URL   = $null
```

분기 동작은 `prisma.config.ts`의 `PRISMA_ENV=production` 조건을 참고한다.

## 관련 환경 변수 (.env.example 발췌)

```
# DB 백엔드 선택 (기본 db)
NEXT_PUBLIC_GYM_DATA_BACKEND=db
NEXT_PUBLIC_FAVORITE_DATA_BACKEND=db
NEXT_PUBLIC_RESERVATION_DATA_BACKEND=db

# Postgres (값은 .env.local에 둔다)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

## 폐기 항목 (참고)

- `src/lib/firebase-gym-repository.ts` — 2026-05-19 제거
- `src/lib/firebase-reservation-repository.ts` — 2026-05-19 제거
- `scripts/seed-gyms.mjs` (Firestore gyms seed) — 2026-05-19 제거
- `docs/firestore-rules.md`, `docs/firestore-gyms-seed.md` — 2026-05-19 제거
- 옛 환경 변수 `NEXT_PUBLIC_GYM_DATA_SOURCE`, `NEXT_PUBLIC_FAVORITE_DATA_SOURCE`, `NEXT_PUBLIC_RESERVATION_DATA_SOURCE` — provider에서 throw
