# CLAUDE.md

## 역할

Claude는 이 저장소에서 주로 프론트엔드 UI, 화면 흐름, 사용자 경험, 문구 정리, 컴포넌트 구현을 담당한다.

이 파일은 `AGENTS.md`를 보완하는 Claude 전용 실행 지침이며, root [`AGENTS.md`](AGENTS.md)가 canonical이다. 충돌 시 더 엄격한 규칙(보통 `AGENTS.md`)을 따른다.

이 파일 자체의 재설계나 재작성은 에이전트가 필요에 의해 사용자에게 요청했을 때, 수락한 경우에만 수행한다.

## 규칙 파일 로딩

- 새 세션 시작 시 root [`AGENTS.md`](AGENTS.md)를 1회 읽는다.
- 작업 대상 경로에 중첩 `AGENTS.md`가 있으면 **그 경로의 것만** 추가로 읽는다. 작업과 관련 없는 중첩 파일은 읽지 않는다.
- 작업 범위가 불확실하면 사용자에게 먼저 확인해 범위를 좁힌다. "혹시 몰라서" 모든 중첩 파일을 미리 읽지 않는다.
- 중첩 `AGENTS.md`의 위치 목록은 root `AGENTS.md` § "Context Map"에 있다. 이 파일에서 다시 나열하지 않는다.
- 같은 세션에서 규칙 파일 변경이 확인되지 않으면 반복해서 다시 읽지 않는다.
- AGENTS.md의 규칙(비밀 보호, Git, 6원칙, 명령어 원칙, 문서 수정 정책, Next.js 16 문서 확인)은 이 파일에서 다시 풀어 쓰지 않는다.

### 작업 영역 매핑 (참고)

작업 종류에 따라 추가로 읽어야 할 중첩 파일은 대체로 다음과 같다. 작업 범위가 한 영역으로 명확하면 그 영역만 읽는다.

| 작업 종류 | 추가로 읽을 파일 |
|---|---|
| UI 컴포넌트 (`src/components/*`) 만 수정 | `src/components/AGENTS.md` |
| page / layout / route handler 수정 | `src/app/AGENTS.md` |
| 서버 모듈 / API 응답 / repository 수정 | `src/lib/server/AGENTS.md` |
| schema / migration / seed 수정 | `prisma/AGENTS.md` |
| 위 중 둘 이상 걸치는 작업 | 걸치는 영역의 파일만 |

## 변경 전 알림과 승인

명확한 구현 요청을 받은 경우에는 별도 승인 없이 진행하되, 수정 전 변경 범위와 이유를 짧게 알린다.

단, 다음 경우에는 사용자 승인을 먼저 받는다.

- 새 기능의 요구사항이 불명확한 경우
- 새 파일 생성 범위가 크거나 구조 변경이 필요한 경우
- 기존 동작을 바꾸는 UX/정책 변경
- README/docs 수정
- 커밋/푸시/되돌리기
- 파괴적 명령 또는 DB 영향 가능성이 있는 작업

## 구현 전 체크리스트

multi-step 흐름, 인증, 외부 호출, 예약/탈퇴처럼 부분 실패가 발생할 수 있는 작업, **또는 여러 도메인/모듈에 같은 패턴 변경이 필요한 작업**은 happy path 코딩 전에 다음을 한 번 짚는다. 정의 자체는 root [`AGENTS.md`](AGENTS.md) § Golden Rules § 6원칙을 따른다.

1. **SSOT** — 이 값/규칙의 단일 기준점은 어디인가? 별도 JSON/캐시/하드코딩으로 분산되지 않는가?
2. **부분 실패** — 다단계 흐름의 중간 단계가 실패하면 사용자와 데이터는 어떤 상태가 되는가? 실패를 성공처럼 보이게 하지 않고 명시적으로 응답하는가?
3. **재시도 idempotency** — 같은 액션을 다시 누르면 데이터가 중복되거나 꼬이지 않는가? (예: 사유 중복 기록, 잔여 토큰/락)
4. **bearer·cookie·redirect 보안** — URL에 노출되는 값, cookie nonce, OAuth callback에서의 Authorization 헤더 부재 같은 특성이 보강되어 있는가?
5. **사용자 상태 전이** — 사용자가 중간에 닫거나 다시 누르거나 실패한 뒤 다음 액션을 했을 때 화면 상태가 정의되어 있는가? (모달, multi-step 폼, 권한 모달, 자동 정렬 등)
6. **Edge case 테스트** — happy path 외에 conflict, retry, token/state mismatch, 브라우저 권한 흐름이 테스트로 잡혀 있는가?
7. **동일 계층 sweep** — provider/repository/환경변수/legacy throw 같은 계층 변경 시, **작업 진입 직후 `rg "<pattern>"`을 1회 실행**해 sibling 도메인 목록을 표(도메인 × 항목: 변수명/허용값/기본값/legacy throw/테스트/repository 파일)로 사용자에게 먼저 보고한다. 같은 변경이 필요한 sibling은 한 묶음에 포함시키고, 의도적으로 분리할 경우 그 이유를 명시한다. **큰 변경 닫기 전 같은 grep을 한 번 더 실행해 잔존이 없는지 evidence를 1줄로 보고한다.** 사례: gym BACKEND 전환 시 reservation/favorite도 같은 상태인지 확인.

이 체크리스트는 root `AGENTS.md`의 6원칙을 약화하지 않으며 작업 진입 시점의 의식 포인트로만 둔다.

## 새 파일 생성

새 파일은 기존 파일에 넣는 것보다 책임 분리가 명확할 때만 만든다.

작업 요청에 새 화면/컴포넌트/client helper/test 생성이 포함되어 있거나, 기존 패턴상 새 파일이 자연스러운 경우에는 경로와 이유를 먼저 알리고 진행한다.

구조 변경, 대량 파일 생성, 새 디렉터리 도입은 사용자 확인을 받는다.

## 에러 보고 형식

에러가 발생하면 원인 분석과 해결책을 함께 제시한다. 메시지만 그대로 보여주지 않는다. 말없는 fallback 대신 사용자에게 명확히 보고한다.

다단계 작업의 마지막 단계가 실패하면 앞 단계 성공만 가지고 ok 응답하지 않는다. 명시적 실패 reason과 재시도 안내(가능하면 idempotent 재시도 경로)를 함께 전달한다.

## 응답 언어

답변과 사용자 설명은 한국어로 작성한다.

코드 주석은 기존 파일의 언어 스타일을 따른다. 새 주석이 필요하고 특별한 이유가 없으면 한국어로 작성한다.

## 진행 추적

3단계 이상 작업이나 다중 파일 수정에는 TodoWrite 등 사용 가능한 진행 추적 도구로 단계를 노출한다. 단일 단순 작업에는 사용하지 않는다.

## Codex와의 작업 분담 (default)

기본 흐름이며 강제는 아니다. 사용자가 명시적으로 다르게 지시하면 그쪽을 따른다.

- Codex: 백엔드/API, Prisma/DB, repository, 인증/권한, 테스트 기반 안정화
- Claude: 프론트 화면, 컴포넌트, 사용자 흐름, UI 상태, 화면 문구

동시 작업 시 파일 범위를 분리한다. Codex 측 작업 규칙은 Codex가 참조하는 규칙 파일을 따르고, 충돌 시 root `AGENTS.md`를 기준으로 본다.

새 API 계약이 필요하면 임의로 만들지 않고 사용자(또는 Codex)와 범위를 먼저 맞춘다.

## Claude 검증 기준

UI만 수정한 경우:

- `npm run lint`

UI 수정이 컴포넌트 prop/타입 변경을 동반한 경우:

- `npm run lint`
- `npx tsc --noEmit --pretty false`

API 계약을 사용하는 client helper를 수정한 경우:

- 관련 client test가 있는지 확인 후 실행

빌드/DB 영향이 있는 변경 또는 화면 검증이 필요한 경우:

- AGENTS.md § "검증"의 빌드·DB 규칙을 따른다.
- 브라우저 확인이 필요하고 Claude 환경에서 `/browse` 스킬(gstack)을 사용할 수 있으면 우선 사용한다.
- 해당 도구를 사용할 수 없거나 사용자 환경에서만 확인 가능한 경우, 사용자에게 브라우저 확인을 요청한다.
- `mcp__claude-in-chrome__*` 도구는 사용하지 않는다.

## Health Stack

- typecheck: npx tsc --noEmit --pretty false
- lint: npm run lint
- test: npm run test