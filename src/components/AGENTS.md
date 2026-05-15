# src/components/AGENTS.md

## Module Context

`src/components`는 화면 컴포넌트와 사용자 인터랙션 단위가 모이는 영역이다. 페이지(`src/app/*/page.tsx`)에서 호출되며, 데이터 표시·입력·상태 전환·문구 일관성을 담당한다.

이 파일은 root [`AGENTS.md`](../../AGENTS.md)를 약화할 수 없다.

## Local Tech Stack & Constraints

- React 19, TypeScript, Tailwind 4
- 대부분 Client Component(`"use client"`)다. Server Component가 필요한 경우 상위 page에서 처리하고 props로 전달한다.

## Implementation Patterns

### 책임 분리

화면 컴포넌트는 다음에 집중한다.

- 상태 표현 (로딩/오류/빈 상태/성공)
- 사용자 입력
- 접근 가능한 버튼·링크·폼
- 기존 API client helper 호출
- 화면 문구

다음은 컴포넌트에 끌어오지 않는다.

- 서버 전용 모듈 import (`src/lib/server/*`, `firebase-admin`, Prisma client)
- 예약 규칙, repository 선택, gym 가격 계산 같은 SSOT 규칙의 중복 구현
- 직접적인 인증 토큰 검증·복호화

### Client helper 호출

- 서버 데이터는 `src/lib/*-client.ts`(예: `user-profile-client.ts`, `user-summary-client.ts`, `reservation-detail-client.ts`)를 통해 받는다.
- helper의 결과 타입(`ok: true | false`, `kind`, `message`, `status`)을 그대로 반영해 UI 상태를 만든다.
- 응답을 helper 외부에서 다시 type guard하지 않는다. 필요하면 helper 측에 가드를 추가한다.

### 상태 표현 일관성

- 같은 의미의 상태는 같은 문구·색상·뱃지로 표현한다.
- 예약 상태 라벨/색상은 `reservation-ticket.tsx` 의 `reservationStatusLabel`, `reservationStatusBadgeStyles`를 재사용한다.
- 로딩 상태는 `aria-live="polite"`, `aria-busy="true"`를 함께 부여한다.
- 오류 상태는 `role="alert"` + 메시지 + 가능한 경우 status code를 함께 표시한다(No Silent Fallback).
- 빈 상태는 "왜 비어 있는지 + 다음 행동"을 함께 안내한다.

### Tailwind 패턴

- 기존 컴포넌트의 스타일 토큰(`text-slate-950`, `text-sky-700`, `border-slate-200` 등)을 먼저 따른다.
- 새 색상/spacing 토큰을 임의로 도입하지 않는다.
- 버튼은 동일한 높이(`h-10`, `h-11`)·radius(`rounded-md`)·포커스 링(`focus-visible:ring-2 focus-visible:ring-sky-500`) 규칙을 유지한다.

### 폼

- 입력 변경 시 저장 성공 알림은 자동으로 해제(또는 idle로 전환)한다. 이전 성공 메시지가 새 입력 상태와 충돌하지 않게 한다.
- 저장 중에는 입력·버튼을 disable한다.
- 검증 실패와 서버 실패를 같은 영역에 모아 표시한다.

### React 19 hooks 주의

- `useEffect` 본문에서 `setState`를 그대로 호출하지 않는다(`react-hooks/set-state-in-effect`).
- 렌더 본문에서 `ref.current`를 변경하지 않는다(`react-hooks/refs`).
- early-return 뒤에 hook을 호출하지 않는다.
- AbortController를 쓰는 useEffect는 cleanup에서 `abort()` 한다.

## Testing Strategy

- 단위 테스트보다는 사용자 흐름 단위의 검증을 우선한다. 단위 검증이 필요한 순수 로직은 `src/lib/*`로 추출한다.
- 로딩, 빈 상태, 인증 필요, API 실패, mutation rollback 같은 error/edge 상태가 화면에 명확히 드러나는지 확인한다.
- 시각적/상호작용 회귀가 의심되면 사용자에게 브라우저 확인을 요청한다.

## 브라우저 확인 기준

다음 변경은 lint·tsc만으로 충분하지 않다. 브라우저 확인이 필요하다.

- 새 페이지/섹션 추가
- 폼 흐름, 저장/취소 같은 mutation UI 추가
- 상태 표현 컴포넌트(뱃지, 상태 메시지)의 색상/문구 변경
- 반응형 레이아웃 변경

Claude 환경에서 `/browse` 스킬(gstack)을 사용할 수 있으면 우선 사용한다. 그렇지 않으면 사용자에게 확인을 요청한다. `mcp__claude-in-chrome__*` 도구는 사용하지 않는다.

## Local Golden Rules

- 서버 전용 모듈을 직접 import하지 않는다(SSR 빌드는 통과해도 번들 분리 원칙을 깬다).
- 예약 규칙·gym 계산 같은 SSOT를 컴포넌트 내부에서 중복 구현하지 않는다.
- 오류·실패를 silent fallback으로 숨기지 않는다.
- 같은 상태에 다른 문구/색상을 도입하지 않는다.
- React 19 hooks lint를 우회하지 않는다.
