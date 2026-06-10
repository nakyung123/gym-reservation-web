# 운영 Runbook

운영자가 배포·복구·권한 관리를 실수 없이 수행하기 위한 절차서다. 코드 동작과 1:1로
맞춰 작성했으며, 동작이 바뀌면 이 문서도 함께 갱신한다.

- 대상: 이 서비스를 운영/배포하는 사람.
- 환경: Vercel(앱) + Supabase Postgres(운영 DB, Seoul) + Firebase Auth.
- 로컬 OS 기준 명령은 PowerShell(Windows)을 사용한다.

## 비밀 취급 원칙 (먼저 읽기)

- 이 문서에는 **비밀값 원문을 적지 않는다.** 변수명과 "어디서 가져오는지"만 적는다.
- 서비스 계정 JSON, `FIREBASE_ADMIN_PRIVATE_KEY`, OAuth client secret, `RATE_LIMIT_HMAC_SECRET`,
  DB 접속 URL은 로그·캡처·채팅·커밋에 절대 노출하지 않는다.
- PowerShell에 운영 비밀을 임시 주입했으면 **작업 직후 변수를 비운다**(`$env:X = $null`).
- `.env.local`, `.env`, `.env.test.local`, `./secrets/*`는 커밋하지 않는다.

---

## 1. 관리자 권한(admin custom claim) 부여·회수

### 권한 계층 (혼동 주의)

이 서비스의 관리자 보호는 **완전히 분리된 두 계층**이다. 둘은 서로 자격을 공유하지 않는다.

| 계층 | 보호 대상 | 자격 | 구현 |
|---|---|---|---|
| 페이지 1차 잠금 | `/admin`, `/admin/*` 화면 | `ADMIN_PAGE_USER` / `ADMIN_PAGE_PASSWORD` (Basic Auth) | `src/proxy.ts` |
| API 권한 | `/api/admin/*` | Firebase ID token + custom claim `admin === true` | `src/lib/server/admin-auth.ts` |

운영 관리자 계정에는 **배포 전에 custom claim `admin=true`가 부여되어 있어야** API가 동작한다.
Basic Auth만으로는 `/api/admin/*`를 호출할 수 없다.

### 부여

대상 사용자의 Firebase `uid`가 필요하다(Firebase Console → Authentication → Users).

```powershell
# 로컬 .env.local 자격으로 실행 (npm alias가 dotenv -e .env.local 주입)
npm run admin:grant-claim -- <uid>
```

운영 Firebase 프로젝트 자격으로 한 번 돌릴 때는 자격을 임시 주입한 뒤 스크립트를 직접 실행한다.

```powershell
# 옵션 ㄴ: 환경변수 3개 주입 (작은따옴표 필수, PRIVATE_KEY는 \n 그대로)
$env:FIREBASE_ADMIN_PROJECT_ID   = '<project-id>'
$env:FIREBASE_ADMIN_CLIENT_EMAIL = '<client-email>'
$env:FIREBASE_ADMIN_PRIVATE_KEY  = '<private-key>'
node scripts/grant-admin-claim.mjs <uid>
# 끝나면 즉시 비운다
$env:FIREBASE_ADMIN_PROJECT_ID = $null
$env:FIREBASE_ADMIN_CLIENT_EMAIL = $null
$env:FIREBASE_ADMIN_PRIVATE_KEY = $null
```

옵션 ㄱ(서비스 계정 JSON 경로)을 쓰려면 `$env:GOOGLE_APPLICATION_CREDENTIALS = '<json 경로>'`만
주입하고 같은 방식으로 실행한다.

### 회수

```powershell
node scripts/grant-admin-claim.mjs <uid> --revoke
```

회수는 claim 삭제 + **refresh token 무효화**(`revokeRefreshTokens`)까지 수행한다.
서버가 `verifyIdToken(token, true)`로 회수 여부까지 검사하므로(`admin-auth.ts:43`),
이미 발급된 ID token도 즉시 차단된다.

### 반영 확인

- 부여/회수는 즉시 Firebase에 반영되지만, **해당 계정의 현재 ID token에는 자동 반영되지 않는다.**
- 반영하려면 해당 계정이 **재로그인**하거나 클라이언트에서 `getIdToken(true)`로 강제 갱신한다.
- 부여 검증: 그 계정으로 `/admin` 진입 후 관리자 화면 데이터(예약/시설 목록)가 로드되면 API 권한이 통과한 것.
- 회수 검증: 회수 직후 그 계정의 `/api/admin/*` 호출이 `401`(토큰 회수됨) 또는 `403`(claim 없음)이 되는지 확인.

### 주의

- claim은 `{ admin: true }` **불리언만** 인정한다. 문자열 `"true"`는 통과하지 못한다.
- 스크립트는 기존 다른 custom claim을 보존하고 `admin` 키만 갱신한다.
- 비밀값(키/토큰/이메일)은 출력하지 않는다. 화면에는 대상 uid와 결과 상태만 나온다.

---

## 2. App Check (reCAPTCHA v3) enforce 전/후 확인

App Check는 **점진 도입** 설계다. 키가 있으면 클라이언트가 자동으로 토큰을 첨부하고,
없으면 조용히 skip하며 기존 Auth 흐름은 그대로 동작한다(`src/lib/firebase-client.ts:28-44`).
**enforce(차단) 전환은 코드가 아니라 Firebase Console에서** 켠다.

### 도입 순서 (권장)

1. **키 등록** — Firebase Console → App Check → reCAPTCHA v3 공급자 등록 → 사이트 키 발급.
2. **배포** — Vercel 운영 env에 `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY`(공개 키) 추가 → 재배포.
   이 값은 `NEXT_PUBLIC_` 빌드타임 인라인이라 **추가 후 재배포해야** 클라이언트 번들에 들어간다.
3. **모니터링 (며칠)** — Firebase Console → App Check → 각 API(Identity Toolkit 등)의
   **verified 요청 비율**을 본다. 정상 사용자 트래픽이 거의 100% verified로 잡힐 때까지 기다린다.
4. **enforce ON** — verified 비율이 충분히 높고 unverified가 실제 공격/봇으로 판단되면,
   Console에서 해당 API의 **Enforce**를 켠다.

### enforce 전 점검

- Vercel **운영** env에 `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY`가 실제로 들어 있고, 그 키로 재배포됐는가.
- 모든 인증 흐름이 `getFirebaseClient()`(=App Check 초기화 경유)를 타는가. (직접 `getAuth` 우회 금지)
- Firebase Console verified 비율이 며칠간 안정적으로 높은가.

### enforce 후 점검 / 롤백

- 전환 직후 로그인/예약 흐름이 정상인지 직접 1회 확인한다.
- 인증 실패가 급증하면 = 정상 클라이언트가 토큰을 못 보내고 있다는 신호다.
- **롤백은 즉시 가능**: Console에서 해당 API의 **Enforce를 끄면** 재배포 없이 복구된다.
  (코드 변경/배포 불필요)
- 초기화 실패는 throw하지 않고 `console.warn("[app-check] ...")`만 남긴다. enforce 전에는
  Auth가 계속 동작하지만, enforce 후에는 토큰 미첨부 호출이 Firebase에서 차단되므로
  enforce 전에 반드시 verified 비율을 확인한다.

---

## 3. Supabase RLS 상태 점검

### 현재 정책

- 모든 도메인/메타 테이블에 **RLS 활성 + 정책 0건 = deny default**.
  anon / authenticated PostgREST 직접 접근은 전부 거부된다.
- **FORCE ROW LEVEL SECURITY는 쓰지 않는다.** Prisma는 table owner(Supabase pooler `postgres` role,
  BYPASSRLS)로 접근하므로 RLS의 영향을 받지 않는다. FORCE를 켜면 Prisma 트래픽 전체가 막힌다.
- 근거 마이그레이션: `20260526124231_enable_rls_deny_default`,
  `20260526132907_enable_rls_prisma_migrations`, `20260526163837_add_rate_limit_bucket`.

### RLS가 켜져 있어야 하는 테이블 (총 14개)

`gyms`, `gym_sports`, `favorites`, `user_profiles`, `reservations`, `reservation_locks`,
`reservation_slots`, `withdrawal_reasons`, `oauth_attempts`, `auth_handover_tickets`,
`_prisma_migrations`, `rate_limit_buckets`, `audit_logs`, `user_notes`.

### 점검 SQL (Supabase → SQL Editor에서 실행)

```sql
-- (1) public 스키마 모든 테이블의 RLS 상태. rls_enabled가 전부 true여야 한다.
SELECT relname            AS table_name,
       relrowsecurity     AS rls_enabled,
       relforcerowsecurity AS rls_forced   -- 전부 false 여야 정상 (FORCE 미사용)
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;
```

```sql
-- (2) RLS가 꺼진 테이블만 추출. 결과가 0행이어야 한다.
--     (신규 테이블을 RLS 없이 추가하면 여기에 잡힌다 = Supabase Advisor "RLS Disabled in Public")
SELECT relname AS table_without_rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relrowsecurity = false
ORDER BY relname;
```

```sql
-- (3) 정책 목록. deny-default 설계이므로 결과가 0행이어야 한다.
--     정책이 생겨 있으면 anon/authenticated에 일부 row가 열렸다는 뜻이니 의도 확인.
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 점검 시점

- 신규 테이블이 추가된 마이그레이션을 운영에 배포한 직후 (2)를 돌려 누락 테이블이 없는지 확인.
- 정기적으로 Supabase Dashboard → **Advisors**의 "RLS Disabled in Public" 경고가 없는지 확인.
- **새 테이블 추가 시 마이그레이션에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 함께 넣는다**
  (기존 테이블과 동일 패턴). 그래야 (2)가 계속 0행으로 유지된다.

---

## 4. Rate limit 운영 관찰

### 동작 요약

- DB 기반(`rate_limit_buckets` 테이블)으로 카운트한다. in-memory 아님(`src/lib/server/rate-limit.ts`).
- 식별자(IP/email/uid/ticketId 원문)는 저장하지 않고 **HMAC-SHA256 해시만** 저장한다.
- fixed window. `count > limit`이면 `429` + `Retry-After` 헤더로 응답한다.
- `RATE_LIMIT_HMAC_SECRET`(16자 이상)가 없으면 helper가 **throw → OAuth/admin API가 500**으로 묶인다.
- 만료 bucket은 호출 시 5% 확률로 opportunistic 정리된다.

### 주요 scope

| scope | 위치 | 한도 |
|---|---|---|
| `admin-page:ip` | `src/proxy.ts` (/admin Basic Auth brute force 방어) | 30회 / 60초 |
| `admin-api:ip` | `/api/admin/*` | 코드 확인 (별도 scope, cross-scope HMAC 격리) |
| `oauth-*` | 카카오/네이버 start·token·finalize·callback | 각 route 코드 확인 |

> 한도 수치는 각 route 코드가 SSOT다. 운영 한도를 조정하려면 코드를 바꾸고 배포해야 한다(런타임 변경 불가).

### 관찰 포인트

1. **429 발생** — Vercel 로그에서 HTTP 429를 관찰한다. 특정 IP/엔드포인트에 몰리면 공격 또는 한도 과소 신호.
2. **scope별 현황** — 어떤 흐름에서 한도에 닿는지 본다(원문 식별자는 노출 안 됨, 해시·count만):

```sql
-- 최근 활성 window에서 scope별 요청 집중도 (원문 식별자 없음)
SELECT scope,
       COUNT(*)          AS active_buckets,
       MAX(count)        AS max_count_in_window,
       SUM(count)        AS total_hits
FROM rate_limit_buckets
WHERE expires_at > NOW()
GROUP BY scope
ORDER BY total_hits DESC;
```

```sql
-- bucket 테이블이 비정상적으로 커지는지 (cleanup이 따라오는지) 점검
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired_not_cleaned
FROM rate_limit_buckets;
```

3. **500 급증** — OAuth/admin API가 갑자기 500이면 `RATE_LIMIT_HMAC_SECRET` 누락/길이부족을 먼저 의심한다(§6).

---

## 5. 배포 전 env 체크리스트

### 빌드가 자동으로 막는 값 (fail-fast 가드)

`npm run build`는 `node scripts/check-admin-env.mjs`를 먼저 실행한다. 다음이 비었거나 정책 위반이면
**빌드 자체가 실패**한다(비밀값은 출력 안 됨, 변수명만):

- `ADMIN_PAGE_USER` — 누락 시 차단
- `ADMIN_PAGE_PASSWORD` — 누락 시 차단
- `RATE_LIMIT_HMAC_SECRET` — 누락 또는 16자 미만 시 차단

> CI(`.github/workflows/ci.yml`)는 검증 빌드라 `SKIP_ADMIN_ENV_CHECK=1`로 이 가드를 건너뛴다.
> **운영(Vercel) 빌드는 이 값을 설정하지 않으므로 가드가 살아 있다.** Vercel env에 위 3개가
> 반드시 들어 있어야 운영 빌드가 통과한다.

### 운영(Vercel) 환경변수 전체 (`.env.example` 기준)

| 그룹 | 변수 | 비고 |
|---|---|---|
| Firebase 클라이언트 | `NEXT_PUBLIC_FIREBASE_API_KEY` 외 5개 | 공개값, 브라우저 노출 OK |
| App Check | `NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY` | 공개 키. 없으면 App Check skip(§2) |
| admin 페이지 | `ADMIN_PAGE_USER`, `ADMIN_PAGE_PASSWORD` | 서버 전용. `NEXT_PUBLIC_` 금지. 누락 시 /admin 503 |
| rate limit | `RATE_LIMIT_HMAC_SECRET` | 서버 전용. 16자 이상. 누락 시 OAuth/admin 500 |
| Firebase Admin | `FIREBASE_ADMIN_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | 서버 전용(옵션 ㄴ). 또는 `GOOGLE_APPLICATION_CREDENTIALS`(옵션 ㄱ) |
| 카카오 OAuth | `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | 서버 전용. redirect는 운영 도메인 |
| 네이버 OAuth | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI` | 서버 전용. redirect는 운영 도메인 |
| 데이터 백엔드 | `NEXT_PUBLIC_GYM_DATA_BACKEND` / `_FAVORITE_` / `_RESERVATION_` | 운영은 모두 `db`. 옛 `*_DATA_SOURCE`는 throw |
| Postgres | `DATABASE_URL`, `DIRECT_URL` | Supabase 통합값 매핑(아래) |

- `DATABASE_URL` ← Supabase `POSTGRES_PRISMA_URL` (pooled, 앱 트래픽용)
- `DIRECT_URL` ← Supabase `POSTGRES_URL_NON_POOLING` (direct, migration용)

### 배포 전 수동 점검

- [ ] `main` 기준 CI(test·lint·build) 통과.
- [ ] 위 운영 env가 Vercel에 모두 등록(특히 빌드 가드 3종 + Postgres 2종).
- [ ] 운영 도메인이 Firebase Authentication **승인 도메인**에 등록.
- [ ] 카카오/네이버 콘솔의 redirect URI가 운영 도메인과 일치.
- [ ] (App Check 도입했다면) §2 enforce 전 점검 완료.
- [ ] 새 마이그레이션이 있으면 운영 DB 적용(§7) + RLS 누락 점검(§3-(2)).

---

## 6. 배포 · Rollback 절차

### 배포

- `main`에 머지되면 Vercel이 자동 배포한다. 운영 빌드는 `check-admin-env → prisma generate → next build`.
- 빌드 실패 시 Vercel 로그에서 단계를 본다. `[check-admin-env] 빌드 차단: ...`이면 §5 env 누락이다.

### 앱 Rollback (코드/배포 되돌리기)

- **Vercel Dashboard → 해당 프로젝트 → Deployments → 직전 정상 deployment → "Promote to Production".**
- 즉시 적용되며 빌드 재실행 없이 이전 산출물로 복구된다. **DB 스키마와는 무관**하다.
- 앱만 되돌려도 DB는 그대로이므로, **마이그레이션을 동반한 배포를 되돌릴 때는 DB 호환성에 주의**한다
  (아래 DB Rollback 참고).

### DB Rollback (마이그레이션 되돌리기)

- Prisma 마이그레이션은 **forward-only**다. down 마이그레이션이 없다.
- 이미 적용된 마이그레이션 파일을 **편집하거나 삭제하지 않는다**(checksum/이력 깨짐).
- 되돌리려면 **되돌리는 내용의 새 마이그레이션을 추가**해서 forward로 적용한다.
- 데이터 손상/대규모 사고 시에는 마이그레이션 되돌리기보다 **Supabase 백업 복구**(§8)를 우선 검토한다.
- 운영 DB에 마이그레이션을 적용하는 절차(PowerShell 임시 주입):

```powershell
# 1) 운영 URL 임시 주입 (작은따옴표 필수, 외부 노출 금지)
$env:DATABASE_URL = '<POSTGRES_PRISMA_URL>'
$env:DIRECT_URL   = '<POSTGRES_URL_NON_POOLING>'

# 2) 운영 전용 스크립트 (PRISMA_ENV=production 마커가 .env.local override를 건너뛴다)
npm run db:migrate:prod   # 운영 DB에 migration 적용

# 3) 끝나면 변수 비우기
$env:DATABASE_URL = $null
$env:DIRECT_URL   = $null
```

> 마이그레이션을 동반한 배포 순서: **DB 마이그레이션 먼저 적용 → 앱 배포**. 새 컬럼/테이블을
> 기대하는 코드가 DB보다 먼저 뜨면 런타임 오류가 난다.

---

## 7. CI 실패 대응

CI(`.github/workflows/ci.yml`)는 `main` push와 PR에서 돈다. Postgres 17 서비스 컨테이너 위에서
순서대로: `npm ci` → `db:test:migrate` → `test` → `lint` → `build`(`SKIP_ADMIN_ENV_CHECK=1`).

| 실패 단계 | 흔한 원인 | 로컬 재현 |
|---|---|---|
| Apply test database migrations | 마이그레이션 SQL 오류, shadow DB 이슈 | `npm run db:test:migrate` (test DB 필요) |
| Test | 단언/스키마 변경 누락, DB 의존 테스트 | `npm run test` (test DB 필요) |
| Lint | eslint 위반 | `npm run lint` |
| Build | 타입 오류, Next 빌드 오류 | `npm run build` |

- **DB 의존 테스트**는 로컬 test DB(`gym_reservation_test`)가 필요하다. `test:unit`은 curated 서브셋이라
  초록이어도 CI 전체(`npm run test`) 초록을 보장하지 않는다.
- 원칙: **fix-forward**. CI에서 실패하면 로컬에서 해당 단계를 그대로 재현해 고친 뒤 다시 푸시한다.
- 단언 값을 바꿨으면 해당 테스트도 같이 갱신한다(테스트를 무력화해 통과시키지 않는다).

---

## 8. 백업 · 복구 (최소 절차)

운영 데이터는 Supabase Postgres가 SSOT다. 백업/복구는 Supabase 기능을 1차로 쓴다.

### 백업

- **자동 백업**: Supabase Dashboard → **Database → Backups**에서 자동 백업 주기/보존을 확인한다.
  세부 정책(일일/PITR 등)은 Supabase 플랜에 따라 다르므로 현재 플랜 기준으로 확인한다.
- **수동 스냅샷**(이식 가능, 마이그레이션/대형 변경 직전 권장): `DIRECT_URL`로 `pg_dump`.

```powershell
# 운영 DIRECT_URL을 임시 주입한 뒤 덤프 (URL/덤프 파일은 외부 노출 금지)
$env:PGSSLMODE = 'require'
pg_dump '<POSTGRES_URL_NON_POOLING>' -Fc -f ".\backup-$(Get-Date -Format yyyyMMdd-HHmm).dump"
$env:PGSSLMODE = $null
```

### 복구

- **Supabase 백업 복구**: Dashboard → Database → Backups → 해당 시점 restore. 데이터 사고 시 1차 수단.
- **수동 덤프 복구**: `pg_restore`로 복원(빈/신규 DB 권장).

```powershell
$env:PGSSLMODE = 'require'
pg_restore --clean --if-exists -d '<대상 DIRECT_URL>' ".\backup-YYYYMMDD-HHmm.dump"
$env:PGSSLMODE = $null
```

### 권장 운영 습관

- **운영 DB에 마이그레이션/시드를 적용하기 직전 수동 덤프**를 한 번 떠 둔다(롤백 안전망).
- 복구 절차는 한 번이라도 **비운영(staging/로컬) DB에 실제 복원**해 동작을 검증해 둔다.
- 백업 파일과 접속 URL은 비밀로 취급한다(§비밀 취급 원칙).

---

## 부록: 빠른 참조

| 작업 | 명령 / 위치 |
|---|---|
| admin 부여 | `npm run admin:grant-claim -- <uid>` |
| admin 회수 | `node scripts/grant-admin-claim.mjs <uid> --revoke` |
| 운영 마이그레이션 | `$env` 주입 후 `npm run db:migrate:prod` |
| 앱 롤백 | Vercel → Deployments → 직전 정상본 Promote |
| RLS 점검 | §3 SQL (2)·(3) 결과 0행 확인 |
| env 빌드 가드 | `scripts/check-admin-env.mjs` (build prebuild) |
| CI | `.github/workflows/ci.yml` |
