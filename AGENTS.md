# AGENTS.md

## 목적

이 파일은 이 저장소에서 동작하는 코딩 에이전트의 최상위 작업 규칙이다.

이 프로젝트는 MVP 구현과 1차 안정화를 마친 상태이며, 앞으로의 작업은 구조, 책임, 검증 흐름을 유지하면서 점진적으로 확장한다.

`AGENTS.md`는 canonical 규칙 파일이다. 다른 도구별 규칙 파일이나 중첩 규칙 파일은 이 파일의 Golden Rules를 약화할 수 없다.

## 에이전트 역할

이 저장소에서 동작하는 에이전트는 제품 개발자이자 유지보수자로 일한다.

- 기존 아키텍처와 규칙을 보존하면서 기능을 구현한다.
- 변경 범위를 명확히 나누고 사용자 변경사항을 보호한다.
- 작업 전 관련 문서와 기존 구현을 확인한다.
- 변경 후 범위에 맞는 검증을 수행한다.
- 이 파일 자체를 다시 설계하거나 재작성하는 일은 에이전트가 필요에 의해 요청했을 때 사용자가 수락하는 경우에만 수행한다.

## 프로젝트 컨텍스트

- 경로: `C:\Users\82107\nakyung\gym-reservation-web`
- 로컬 기준 주소: `http://localhost:3000`
- 목적: 공공체육시설 예약, 예약 상세, 즐겨찾기, 관리자 예약/시설/슬롯 관리 흐름을 안정적으로 제공한다.
- 스택: Next.js 16, React 19, TypeScript, Tailwind 4, MySQL/Prisma, Firebase Auth

## 명령어 원칙

명령어와 경로는 추측하지 않는다.

사용 가능한 명령어는 저장소 근거에서 확인한다.

- `package.json`
- `README.md`
- `.github/workflows/*`
- `Makefile`
- `justfile`
- `taskfile.yml`

현재 확인된 주요 명령어:

- `npm run dev` — `package.json` scripts
- `npm run lint` — `package.json` scripts
- `npm run test` — `package.json` scripts
- `npm run build` — `package.json` scripts
- `npm run db:test:migrate` — `package.json` scripts
- `npm run db:migrate:dev` — `package.json` scripts
- `npm run db:migrate:deploy` — `package.json` scripts
- `npm run seed:gyms` — `package.json` scripts
- `npm run db:seed` — `package.json` scripts
- `npx tsc --noEmit --pretty false` — `typescript` devDependency와 `tsconfig.json`

명령어가 불확실하면 만들지 말고 TODO와 확인할 파일을 남긴다.

## Golden Rules

아래 규칙은 중첩 `AGENTS.md`나 도구별 규칙 파일이 약화할 수 없다.

### 비밀 정보 보호

다음 파일은 읽지 않고 값을 노출하지 않는다.

- `.env.local`
- `.env`
- `.env.test.local`
- Firebase Admin SDK JSON
- 기타 key, token, secret 파일

파일명 확인은 가능하지만 내용은 열람하거나 출력하지 않는다. 환경 변수 값을 출력하는 명령도 실행하지 않는다.

### Git 규칙

- 작업 전 `git status`를 확인한다.
- 사용자가 명시적으로 요청하지 않으면 커밋하지 않는다.
- 사용자가 명시적으로 요청하지 않으면 푸시하지 않는다.
- 사용자나 다른 도구가 만든 변경사항을 임의로 되돌리지 않는다.
- `git reset --hard`, `git checkout --`, 강제 push 같은 파괴적 명령은 사용자가 명확히 요청한 경우에만 실행한다.

### Next.js 16 규칙

이 프로젝트는 일반적인 Next.js 지식만으로 작업하면 안 된다.

Next.js 관련 코드를 작성하거나 수정하기 전에 관련 문서를 확인한다.

- 문서 위치: `node_modules/next/dist/docs/`
- 대상 예시: Route Handler, Server/Client Component, caching, revalidation, metadata, build/runtime, form/action/mutation

### 6원칙

다음 6원칙은 이 프로젝트의 핵심 설계 원칙이며, 아래 상세 규칙으로 정의한다.

- SSOT
- SRP
- Consistency
- Atomicity
- Idempotency
- No silent fallback

이 원칙을 약화하거나 우회하지 않는다.

### SSOT

- 예약 규칙은 `src/lib/reservation-rules.ts`를 기준으로 한다.
- 예약 저장소 선택은 `src/lib/reservation-repository-provider.ts`를 기준으로 한다.
- 체육관 저장소 선택은 `src/lib/gym-repository-provider.ts`를 기준으로 한다.
- 체육관 초기 mock/seed 데이터는 `src/data/gyms.json`을 기준으로 한다.
- 체육관 가격, 검색, 종목 계산은 `src/lib/gym-utils.ts`를 기준으로 한다.
- 같은 기준을 컴포넌트 안에 중복 구현하지 않는다.

### SRP

- UI 컴포넌트는 UI 표현에 집중한다.
- Firebase, repository, Prisma, 예약 규칙, 서버 인증 책임을 UI 파일로 끌어오지 않는다.
- 서버 전용 코드는 `server-only` 경계를 지킨다.
- Client Component에서는 서버 전용 모듈을 직접 import하지 않는다.

### Consistency

- 같은 상태는 같은 문구, 색상, 버튼 스타일로 표현한다.
- 예약 가능, 예약 완료, 취소, 이용 완료, 오류 상태를 화면마다 다르게 표현하지 않는다.
- 새 UI는 기존 컴포넌트 패턴과 Tailwind 스타일을 먼저 따른다.

### Atomicity

- 예약 생성, 취소, 이용 완료 흐름은 하나의 단위 동작으로 유지한다.
- Prisma transaction 또는 기존 원자성 보장 흐름을 임의로 쪼개지 않는다.
- 예약 슬롯 카운터, 예약 본체, 예약 락의 정합성을 깨뜨리지 않는다.

### Idempotency

- 같은 사용자 행동이 반복되어도 데이터나 UI가 꼬이지 않아야 한다.
- 이미 취소된 예약 취소, 이미 즐겨찾기된 체육관 추가 같은 반복 상황을 안전하게 처리한다.
- 반복 요청을 성공처럼 보이게 하더라도 실제 데이터 정합성을 깨뜨리지 않는다.

### No Silent Fallback

- Firebase 오류, 인증 오류, API 오류, 예약 실패를 숨기지 않는다.
- 실패를 성공처럼 보여주지 않는다.
- localStorage나 mock 데이터로 조용히 대체하지 않는다.
- 사용자에게 필요한 오류 상태를 명확히 전달한다.

### 문서 수정 정책

- README와 docs는 사용자가 명시적으로 요청할 때만 수정한다.
- 기능 작업 중 문서 정리가 필요하면 먼저 사용자에게 말한다.
- 문서 정리는 기능 커밋과 분리하는 것을 기본으로 한다.

## 작업 프로토콜

### 시작 전

- `git status`를 확인한다.
- 관련 파일 위치와 기존 구현 패턴을 확인한다.
- Next.js 관련 작업이면 `node_modules/next/dist/docs/`의 관련 문서를 확인한다.
- 도구별 파일은 해당 도구가 직접 사용하는 경우에만 확인한다. 예: Claude 작업이면 `CLAUDE.md`.
- 비밀 파일은 확인 대상에서 제외한다.

### 구현 중

- 기존 구조를 먼저 따른다.
- 새 추상화는 실제 중복이나 복잡성을 줄일 때만 추가한다.
- API 계약, 타입, 런타임 검증을 함께 고려한다.
- 백엔드와 프론트가 병행 작업 중이면 파일 범위를 분리한다.
- 다른 도구나 사용자가 변경한 파일을 덮어쓰지 않는다.

### 검증

변경 범위에 맞춰 최소한의 검증을 실행한다.

- TypeScript/shared type 변경: `npx tsc --noEmit --pretty false`
- API, repository, Prisma 변경: 관련 테스트, 필요 시 `npm run test`
- UI 변경: `npm run lint`, 필요 시 사용자에게 브라우저 확인 요청
- 빌드 영향 변경: `npm run build`

Windows 환경에서는 Prisma/Next dev server 파일 잠금을 주의한다. `npm run build`는 테스트나 dev server와 동시에 실행하지 않는다.

DB 관련 변경은 migration과 test DB 흐름을 저장소 설정에서 확인한 뒤 진행한다. 운영 DB 영향 가능성이 있거나 destructive DB 명령이면 사용자 확인을 먼저 받는다.

## Context Map

현재 이 저장소에는 root `AGENTS.md`만 존재한다.

중첩 `AGENTS.md`가 생기면 해당 영역 작업 시 함께 확인한다. 존재하지 않는 중첩 파일은 있다고 가정하지 않는다.

중첩 파일 생성 후보:

- `src/app` — Next.js App Router, page, route handler, server/client 경계
- `src/components` — 화면 컴포넌트와 사용자 인터랙션
- `src/lib` — 예약 규칙, 클라이언트 헬퍼, provider, 공용 타입
- `src/lib/server` — Prisma, Firebase Admin, 서버 인증, repository
- `prisma` — schema, migration, DB 정합성
- `tests` — 테스트 환경, setup, DB 테스트 주의사항

## 중첩 AGENTS.md 작성 기준

중첩 `AGENTS.md`는 필요한 경우에만 만든다.

생성 기준:

- 별도 package manifest가 있는 경우
- 프레임워크나 런타임 경계가 다른 경우
- 고위험 비즈니스 로직이 밀집된 경우
- 반복 실수가 발생하는 영역인 경우

중첩 파일은 Module Context, Local Tech Stack & Constraints, Implementation Patterns, Testing Strategy, Local Golden Rules를 포함한다.

중첩 파일은 root Golden Rules를 약화할 수 없다.

## 도구 호환성

- `AGENTS.md`를 canonical로 둔다.
- `CLAUDE.md`, Cursor rules, 기타 도구별 규칙 파일이 있으면 삭제하지 않는다.
- 도구별 파일에는 필요한 경우 `AGENTS.md`를 따르라는 교차 참조를 둔다.
- 동일한 규칙을 여러 파일에 장황하게 복제하지 않는다.
- 중복이 필요하면 `AGENTS.md`를 더 엄격한 기준으로 본다.

## 유지보수 정책

- 명령어, 디렉터리 구조, DB 흐름, 인증 흐름이 바뀌면 `AGENTS.md`를 갱신한다.
- root `AGENTS.md`는 200줄 안팎, 중첩 `AGENTS.md`는 300줄 안팎을 목표로 한다.
- 규칙 파일이 길어져 가독성이 떨어지면 중첩 `AGENTS.md`로 분리한다.
- 규칙 충돌이 있으면 더 엄격한 규칙을 따른다.
- 불확실하면 추측하지 말고 TODO와 확인할 파일 또는 명령을 남긴다.

## 검증

새 세션에서 에이전트는 작업 전 이 파일을 읽고 적용해야 한다.

Codex, Claude, Cursor 등 도구별 로딩 순서가 불확실하면 해당 도구 문서를 확인한다.

컨텍스트 길이 제한으로 규칙이 잘릴 수 있다. 파일이 길어지면 중첩 `AGENTS.md`로 분리한다.