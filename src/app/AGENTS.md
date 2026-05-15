# src/app/AGENTS.md

## Module Context

`src/app`은 Next.js 16 App Router 진입점이다. page, layout, route handler, metadata 정의가 모인다.

- 라우트: `gyms`, `reservations`, `reserve`, `mypage`, `admin`, `api/*`
- 사용자 화면은 page/layout, 서버 액션·API는 `api/*` 에 위치한다.

이 파일은 root [`AGENTS.md`](../../AGENTS.md)를 약화할 수 없다.

## Local Tech Stack & Constraints

- Next.js 16, React 19, TypeScript, Tailwind 4
- App Router 기준이며 Pages Router 패턴을 도입하지 않는다.
- 문서 위치: `node_modules/next/dist/docs/`. 새로운 패턴(예: caching, form, action, metadata, Server Action) 도입 전 해당 문서를 먼저 확인한다.

## Server/Client Component 경계

- 기본은 Server Component다. 상호작용·브라우저 API·React state가 필요한 경우에만 `"use client"`를 붙인다.
- Client Component에서는 다음을 import하지 않는다.
  - `server-only` 모듈
  - Prisma client (`@/lib/server/prisma-client`)
  - Firebase Admin (`@/lib/server/firebase-admin`)
  - 모든 `src/lib/server/*` 파일
- Client Component가 서버 데이터를 필요로 하면, 상위 Server Component에서 받아 props로 내려주거나 `src/lib/*-client.ts` helper를 통해 API를 호출한다.
- 서버 인증 컨텍스트(`src/lib/server/auth.ts`)는 Route Handler/Server Component에서만 사용한다.

## Route Handler 패턴

- `src/app/api/**/route.ts`에 위치한다.
- 요청 검증, 인증, 권한 확인, repository 호출, 응답 직렬화를 한 흐름으로 묶는다.
- 인증은 `src/lib/server/auth.ts` 또는 `src/lib/server/admin-auth.ts`를 사용한다. 새로운 인증 경로를 만들지 않는다.
- 오류 응답은 `{ message: string }` 형태를 유지하고 status code는 의미에 맞게 사용한다(`400`/`401`/`403`/`404`/`409`/`500`).
- 화면/클라이언트 계층의 저장소 선택은 기존 provider(`src/lib/*-repository-provider.ts`)를 따른다. 같은 선택 로직을 Route Handler 안에 다시 만들지 않는다.
- Route Handler는 DB-backed API의 서버 구현 경계이므로 `src/lib/server/mysql-*-repository.ts` 함수를 직접 import할 수 있다.
- Route Handler에서 클라이언트용 `api-*-repository.ts`, `firebase-*-repository.ts`, `local-storage-*-repository.ts`를 import하지 않는다.

## Caching / Revalidation

- 데이터 가변성을 가진 페이지(예: 예약, 즐겨찾기)에는 캐싱 옵션을 임의로 켜지 않는다.
- `fetch` 캐시 옵션, `revalidate`, `dynamic`, `cache` 함수를 변경할 때는 영향 범위를 먼저 확인한다.
- `cookies()`, `headers()` 등 dynamic API 사용은 해당 라우트의 캐싱 동작을 바꾼다. 의도하지 않은 변경을 일으키지 않는다.

## Metadata / Layout

- 페이지 메타데이터는 `metadata` export로 정의한다.
- `layout.tsx`는 라우트 그룹 전반에 적용되므로 단일 페이지 요구사항을 layout에 끌어오지 않는다.
- `globals.css`와 Tailwind 토큰은 root layout에서만 로딩한다.

## Form / Action / Mutation

- Server Action을 새로 도입하기 전에 기존 Route Handler + client helper 패턴과의 일관성을 먼저 검토한다.
- form submit 흐름은 낙관적 업데이트로 실패를 가리지 않는다(No Silent Fallback). 실패 시 명확한 오류 상태를 화면에 표시한다.
- mutation 결과를 화면에 반영할 때 캐시·revalidation 경로를 함께 고려한다.

## Implementation Patterns

- 페이지 컴포넌트는 화면 전체 구조와 데이터 의존성을 정의하고, 세부 UI는 `src/components/*`에 위임한다.
- API 응답 타입과 Client 측 type guard는 `src/lib/*-client.ts`와 `src/lib/*.ts`에서 정의된 것을 사용한다. page/route에서 같은 타입을 다시 선언하지 않는다.
- 관리자 API(`api/admin/*`)는 권한 확인 경로(`src/lib/server/admin-auth.ts`)와 짝지어 동작한다. 관리자 화면(`admin/*`)은 기존 토큰 입력·저장·오류 상태 흐름을 유지한다.

## Testing Strategy

- Route Handler 단위 테스트는 인증, 검증 실패, 권한, 정상 흐름, idempotency를 포함한다.
- Route Handler 변경 시 not found/conflict, 외부 입력 edge case, 예상 밖 repository/DB 실패가 `{ message: string }` 오류 응답으로 드러나는지 확인한다.
- 페이지 컴포넌트는 통합 검증을 우선한다. 단위 테스트가 필요한 로직은 `src/lib/*`로 추출한다.

## Local Golden Rules

- Client Component에서 서버 전용 모듈을 직접 import하지 않는다.
- Route Handler에서 인증/권한 확인을 생략하지 않는다.
- 저장소 선택 provider가 이미 있는 계층에서는 provider를 사용하고, Route Handler의 DB 작업은 서버 전용 repository를 사용한다.
- 캐싱/revalidation 동작을 바꿀 때는 영향 범위를 사용자에게 먼저 알린다.
- 새 Next.js 패턴 도입 전 `node_modules/next/dist/docs/`를 확인한다.
