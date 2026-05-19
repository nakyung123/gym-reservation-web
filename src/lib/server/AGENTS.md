# src/lib/server/AGENTS.md

## Module Context

`src/lib/server`는 서버 전용 모듈이 모이는 경계다. Firebase Admin, DB repository(Postgres-backed), 서버 인증 컨텍스트, Prisma client가 여기에 위치한다.

이 디렉터리의 파일은 Client Component, Client helper(`src/lib/*-client.ts`), 또는 브라우저 번들에 포함될 수 있는 어떤 파일에서도 import되어서는 안 된다.

이 파일은 root [`AGENTS.md`](../../../AGENTS.md)를 약화할 수 없다.

## Local Tech Stack & Constraints

- Postgres + Prisma (`prisma-client.ts`) — 운영은 Supabase Postgres, 로컬은 Docker Postgres
- Firebase Admin SDK (`firebase-admin.ts`)
- 서버 인증: `auth.ts`, `admin-auth.ts`
- repository 구현: `db-*-repository.ts` (Prisma 기반 Postgres 접근 경계)

새 서버 전용 모듈을 추가할 때는 파일 상단에 `import "server-only"`를 명시한다.

## Implementation Patterns

### server-only 경계

- 모든 신규 서버 모듈은 `import "server-only";`로 시작한다.
- 클라이언트 코드에 노출되어도 안전한 타입·상수는 `src/lib/*.ts`(서버 비포함 영역)에 둔다.
- 서버 모듈은 client helper와 타입을 공유할 수 있지만, helper에서 서버 모듈을 import하지 않는다.

### Firebase Admin

- `firebase-admin.ts`만 Firebase Admin SDK 초기화를 담당한다. 다른 곳에서 다시 초기화하지 않는다.
- credential 파일 경로·환경 변수를 출력하지 않는다(비밀 보호).
- ID 토큰 검증은 `auth.ts`를 통해서만 한다.

### Repository

- `src/lib/*-repository-provider.ts`는 화면/클라이언트 계층의 저장소 선택 SSOT다. 같은 선택 로직을 다른 곳에 중복 구현하지 않는다.
- `db-*-repository.ts`는 Route Handler, 서버 전용 모듈, 테스트에서 사용하는 Postgres DB 접근 경계다.
- Route Handler는 필요한 서버 DB 작업을 위해 `db-*-repository.ts` 함수를 직접 import할 수 있다.
- Client Component, client helper, 브라우저 번들에 포함될 수 있는 파일은 `src/lib/server/*`를 import하지 않는다.
- 새 repository가 단일 서버 구현만 갖는다면 provider를 만들 필요는 없다. 여러 구현 선택이 필요해지는 시점에 인터페이스와 provider를 함께 추가한다.
- repository 메서드는 idempotency를 고려해 설계한다. 반복 호출 시 데이터 정합성을 깨뜨리지 않고, 부수효과는 명시적으로 표현한다.

### API 인증 / 권한

- 일반 사용자 인증: `auth.ts` → `Authorization: Bearer <idToken>` 검증, `{ uid, email, ... }` 반환.
- 관리자 권한: `admin-auth.ts` → 일반 인증 + 관리자 클레임 확인.
- 인증 실패는 `401`, 권한 실패는 `403`으로 응답한다.
- 인증 흐름을 우회하거나 직접 토큰을 디코딩하지 않는다.

### 오류 처리

- 서버 오류는 사용자에게 의미 있는 메시지로 변환해 응답한다(`{ message: string }`).
- DB 제약 조건 위반, 트랜잭션 실패, 외부 서비스 오류를 silent fallback 처리하지 않는다.
- 로그가 필요하면 표준 stderr에 남기고, 비밀 값은 로그에 포함하지 않는다.

### Atomicity

- 예약 생성·취소·이용 완료 흐름은 `db-reservation-repository.ts`의 서버 mutation 함수가 트랜잭션을 보장한다.
- 기존 트랜잭션 경계를 임의로 쪼개지 않는다.
- 슬롯 카운터·예약 본체·예약 락의 정합성을 깨뜨리는 부분 갱신을 도입하지 않는다.

## Testing Strategy

- 모든 신규 repository 메서드는 단위 테스트를 동반한다(`*-repository.test.ts`).
- 테스트는 test DB를 사용한다. 운영 DB나 개발 DB에서 실행하지 않는다.
- 인증·권한 테스트는 성공·실패·만료 토큰 케이스를 포함한다.
- DB 제약 조건, 트랜잭션 실패, 외부 서비스 실패, 데이터 없음/중복 같은 edge case를 성공 흐름과 함께 검증한다.
- 트랜잭션 흐름은 동시성·idempotency·rollback 케이스를 함께 검증한다.

자세한 DB/migration 절차는 [prisma/AGENTS.md](../../../prisma/AGENTS.md)를 본다.

## Local Golden Rules

- 모든 신규 파일은 `import "server-only";`로 시작한다.
- 클라이언트 측 코드(`src/lib/*-client.ts`, `src/components/*`, `"use client"` 파일)에서 이 디렉터리를 import하지 않는다.
- 화면/클라이언트 계층의 저장소 선택은 provider를 통해 노출한다. Route Handler의 DB 작업은 서버 전용 repository 경계를 사용한다.
- 인증·권한 가드를 우회하지 않는다.
- 트랜잭션 경계를 임의로 쪼개지 않는다.
- 비밀 값(credential, token)을 응답·로그·예외 메시지에 포함하지 않는다.
