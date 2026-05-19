# prisma/AGENTS.md

## Module Context

`prisma` 디렉터리는 DB 스키마, migration, seed 스크립트를 관리한다.

- `schema.prisma` — Prisma 모델 정의
- `migrations/` — migration 파일
- `seed.mjs` — 초기 데이터 시드

이 파일은 root [`AGENTS.md`](../AGENTS.md)를 약화할 수 없다.

## Local Tech Stack & Constraints

- Postgres + Prisma (운영: Supabase Postgres, 로컬: Docker Postgres 17)
- 운영 DB / 로컬 dev DB / test DB 3개가 분리되어 있다. 명령은 대상 DB를 항상 확인한 뒤 실행한다.
- 운영 작업은 `db:migrate:prod` / `db:seed:prod`만 사용한다. `prisma.config.ts`의 `PRISMA_ENV=production` 분기로 `.env.local` override를 건너뛴다.
- Windows 환경에서는 Prisma Client 생성 시 `query_engine-windows.dll.node` 파일이 잠길 수 있다. dev server·테스트·빌드가 동시에 도는 경우 충돌한다.

## 주요 명령어

저장소 근거(`package.json`)에서 확인된 명령어만 사용한다.

- `npm run db:migrate:dev` — 로컬 dev DB에 migration 적용
- `npm run db:migrate:deploy` — `.env.local` 기반 migration 적용 (로컬 셸에서 dev/test 외 환경에 쓰지 않는다)
- `npm run db:migrate:prod` — 운영(Supabase) DB에 migration 적용. PowerShell `$env:DATABASE_URL`/`$env:DIRECT_URL` 주입 필요
- `npm run db:test:migrate` — test DB에 migration 적용
- `npm run db:seed` — 로컬 dev DB에 seed 실행
- `npm run db:seed:prod` — 운영(Supabase) DB에 seed 실행. PowerShell URL 주입 필요

명령어가 불확실하면 만들지 말고 사용자에게 확인한다.

## Migration 패턴

### 새 migration

1. `schema.prisma`를 변경한다.
2. 변경 의도를 짧게 설명하는 이름으로 migration을 생성한다.
3. 생성된 SQL을 검토한다. 의도와 다른 변경(예: 예상치 못한 컬럼 drop)이 있으면 멈추고 사용자에게 알린다.
4. test DB에서 migration을 적용해 동작을 확인한다.
5. 운영 적용(`db:migrate:deploy`)은 사용자가 명시적으로 요청할 때만 수행한다.

### Destructive 변경

다음은 destructive 변경으로 취급한다.

- 테이블 또는 컬럼 삭제
- 컬럼 타입 변경(데이터 손실 가능)
- 인덱스/유니크 제약 변경
- `prisma migrate reset`

destructive 변경은 사용자 확인을 먼저 받는다. 백업 또는 롤백 경로가 있는지 함께 짚는다.

### 데이터 정합성

- migration이 기존 행에 영향을 미치면 data migration도 같은 PR에 포함시킨다.
- nullable → non-null 전환은 기본값 또는 backfill 전략을 명시한다.
- 외래 키 제약 추가는 기존 데이터 무결성을 먼저 검증한다.

## Test DB 흐름

- 단위 테스트는 test DB(`db:test:migrate`로 준비)를 사용한다.
- 테스트 실행 전 schema 변경이 있으면 `npm run db:test:migrate`를 먼저 실행한다.
- schema/migration 변경은 happy path뿐 아니라 기존 데이터 edge case, 제약 조건 위반, rollback 또는 재시도 가능성을 함께 검토한다.
- 테스트 후 데이터 정리는 각 테스트의 teardown 또는 transaction rollback으로 처리한다. 운영 DB 정리 패턴을 테스트로 가져오지 않는다.

## Windows 파일 잠금 주의

- Prisma Client 생성(`prisma generate`, migration 명령 내부에서도 실행됨)은 `query_engine-windows.dll.node`를 새로 씁니다.
- 다음 명령을 동시에 실행하지 않는다.
  - `npm run dev`(또는 다른 Next.js dev server)
  - `npm run build`
  - `npm run test`
  - migration 명령
- 잠금이 걸리면 충돌하는 프로세스를 먼저 정리한 뒤 재시도한다. 임의로 dll을 삭제하지 않는다.

## Seed

- `seed.mjs`는 멱등성을 유지한다. 같은 시드를 두 번 실행해도 데이터가 중복되지 않게 처리한다 (upsert 사용).
- 로컬 dev DB는 `npm run db:seed`로 시드한다. 운영 DB는 `npm run db:seed:prod`만 사용하고, 사용자가 명시적으로 요청할 때만 실행한다.
- 운영 DB seed는 PowerShell `$env:DATABASE_URL`/`$env:DIRECT_URL` 임시 주입 후 실행하고, 끝나면 변수를 비운다. 비밀값은 코드/로그/채팅에 노출하지 않는다.

## Local Golden Rules

- 운영 DB에 영향을 주는 명령은 사용자 확인 후 실행한다.
- destructive 변경은 사용자 승인 없이 진행하지 않는다.
- migration SQL을 검토하지 않고 적용하지 않는다.
- test DB와 운영 DB를 혼동하지 않는다.
- Prisma Client 생성과 dev server·테스트·빌드를 동시에 실행하지 않는다.
- 비밀 정보(DB URL, 비밀번호)를 출력하지 않는다.
