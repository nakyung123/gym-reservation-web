---
version: alpha
name: 서울체육예약 관리자 콘솔
description: "서울체육예약 운영자용 관리 콘솔. 고객 화면의 넓은 여백과 큰 글자 대신 한 화면에 두 배의 정보를 담는 플랫 SaaS 대시보드다. 퍼플 한 색과 라벤더 틴트, 하이라인 보더만으로 위계를 만들고 그림자·그라디언트·이모지를 쓰지 않는다. 금액보다 예약·이용 현황을 앞세우는 공공기관 톤을 유지한다."

colors:
  # 구현: src/app/globals.css .admin-console (고객 화면과 같은 변수 이름을 덮어씀)
  primary: "#5f43ff"
  primary-hover: "#4a2fd6"
  primary-tint: "#ebeafc"
  on-primary: "#ffffff"
  canvas: "#f7f7f9"
  surface: "#ffffff"
  surface-soft: "#f3f3f7"
  ink: "#111111"
  muted: "#505050"
  subtle: "#767676"
  hairline: "#ececf1"
  hairline-strong: "#e2e2ea"
  success: "#0c8800"
  success-tint: "#e7f3e6"
  warning: "#b45309"
  warning-tint: "#f8eee6"
  error: "#c42a2a"
  error-tint: "#f9eaea"
  # 차트 — 구현: src/components/admin/admin-charts.tsx
  chart-reserved: "#5f43ff"
  chart-used: "#10b981"
  chart-cancelled: "#f43f5e"

typography:
  kpi:           { fontFamily: Pretendard, fontSize: 24px, fontWeight: 700, lineHeight: 1.6, fontFeature: '"tnum" 1' }
  page-title:    { fontFamily: Pretendard, fontSize: 20px, fontWeight: 700, lineHeight: 1.6 }
  section-title: { fontFamily: Pretendard, fontSize: 18px, fontWeight: 700, lineHeight: 1.6 }
  panel-title:   { fontFamily: Pretendard, fontSize: 15px, fontWeight: 700, lineHeight: 1.6 }
  nav:           { fontFamily: Pretendard, fontSize: 15px, fontWeight: 500, lineHeight: 1.6 }
  body:          { fontFamily: Pretendard, fontSize: 13.5px, fontWeight: 400, lineHeight: 1.6, fontFeature: '"tnum" 1' }
  button:        { fontFamily: Pretendard, fontSize: 13px, fontWeight: 700, lineHeight: 1.6 }
  control:       { fontFamily: Pretendard, fontSize: 13px, fontWeight: 400, lineHeight: 1.6 }
  caption:       { fontFamily: Pretendard, fontSize: 12.5px, fontWeight: 400, lineHeight: 1.6 }
  label:         { fontFamily: Pretendard, fontSize: 12px, fontWeight: 700, lineHeight: 1.6 }
  label-sm:      { fontFamily: Pretendard, fontSize: 11.5px, fontWeight: 700, lineHeight: 1.6 }
  group-label:   { fontFamily: Pretendard, fontSize: 10.5px, fontWeight: 700, lineHeight: 1.6, letterSpacing: 0.07em }

rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  sidebar: 256px
  topbar: 64px
  activity-panel: 300px

components:
  page:                 { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body}" }
  page-description:     { backgroundColor: "{colors.canvas}", textColor: "{colors.subtle}", typography: "{typography.control}" }
  sidebar:              { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", width: 256px }
  nav-group-label:      { backgroundColor: "{colors.surface}", textColor: "{colors.subtle}", typography: "{typography.group-label}" }
  nav-item:             { backgroundColor: "{colors.surface}", textColor: "{colors.muted}", typography: "{typography.nav}", rounded: "{rounded.lg}", height: 44px, padding: 0 12px }
  nav-item-active:      { backgroundColor: "{colors.primary-tint}", textColor: "{colors.primary}", typography: "{typography.nav}", rounded: "{rounded.lg}", height: 44px, padding: 0 12px }
  topbar:               { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", height: 64px }
  topbar-search:        { backgroundColor: "{colors.surface-soft}", textColor: "{colors.ink}", rounded: "{rounded.lg}", height: 40px, width: 320px }
  panel:                { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.panel-title}", rounded: "{rounded.lg}", padding: 20px }
  kpi-card:             { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.kpi}", rounded: "{rounded.lg}", padding: 16px }
  kpi-progress:         { backgroundColor: "{colors.hairline}", rounded: "{rounded.full}", height: 8px }
  kpi-progress-fill:    { backgroundColor: "{colors.primary}", rounded: "{rounded.full}", height: 8px }
  table-header:         { backgroundColor: "{colors.surface-soft}", textColor: "{colors.muted}", typography: "{typography.label}", height: 42px, padding: 0 14px }
  table-cell:           { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body}", height: 48px, padding: 0 14px }
  table-row-selected:   { backgroundColor: "{colors.primary-tint}", textColor: "{colors.ink}" }
  status-reserved:      { backgroundColor: "{colors.primary-tint}", textColor: "{colors.primary}", typography: "{typography.label-sm}", rounded: "{rounded.full}", height: 24px, padding: 0 8px }
  status-cancelled:     { backgroundColor: "{colors.error-tint}", textColor: "{colors.error}", typography: "{typography.label-sm}", rounded: "{rounded.full}", height: 24px, padding: 0 8px }
  status-used:          { backgroundColor: "{colors.surface-soft}", textColor: "{colors.muted}", typography: "{typography.label-sm}", rounded: "{rounded.full}", height: 24px, padding: 0 8px }
  status-pending:       { backgroundColor: "{colors.warning-tint}", textColor: "{colors.warning}", typography: "{typography.label-sm}", rounded: "{rounded.full}", height: 24px, padding: 0 8px }
  status-available:     { backgroundColor: "{colors.success-tint}", textColor: "{colors.success}", typography: "{typography.label-sm}", rounded: "{rounded.full}", height: 24px, padding: 0 8px }
  button:               { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", height: 36px, padding: 0 14px }
  button-hover:         { backgroundColor: "{colors.primary-hover}", textColor: "{colors.on-primary}" }
  button-outline:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.md}", height: 36px, padding: 0 14px }
  button-inline:        { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.label}", rounded: "{rounded.sm}", height: 28px, padding: 0 10px }
  control:              { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.control}", rounded: "{rounded.md}", height: 36px, padding: 0 12px }
  field-label:          { backgroundColor: "{colors.surface}", textColor: "{colors.muted}", typography: "{typography.label-sm}" }
  toggle-active:        { backgroundColor: "{colors.primary-tint}", textColor: "{colors.primary}", typography: "{typography.button}", rounded: "{rounded.md}", height: 36px }
  divider:              { backgroundColor: "{colors.hairline}", height: 1px }
  divider-strong:       { backgroundColor: "{colors.hairline-strong}", height: 1px }
  notice-error:         { backgroundColor: "{colors.error-tint}", textColor: "{colors.error}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 12px 16px }
  notice-warning:       { backgroundColor: "{colors.warning-tint}", textColor: "{colors.warning}", typography: "{typography.body}", rounded: "{rounded.lg}", padding: 12px 16px }
  chart-series-reserved:  { textColor: "{colors.chart-reserved}" }
  chart-series-used:      { textColor: "{colors.chart-used}" }
  chart-series-cancelled: { textColor: "{colors.chart-cancelled}" }
---

# 서울체육예약 관리자 콘솔 DESIGN

> **미리보기**: [nakyung123.github.io/gym-reservation-web/design-admin.html](https://nakyung123.github.io/gym-reservation-web/design-admin.html) — 토큰을 색·글꼴·컴포넌트로 그려 보여준다. 이 파일을 `main`에 푸시하면 자동으로 갱신된다.

`/admin/*` 화면의 디자인 시스템이다. 고객·인증 화면은 [`DESIGN.md`](DESIGN.md)를 본다.
토큰(위 front matter)이 규범값이고, 구현은 `src/app/globals.css`의 `.admin-console` 블록과 `src/components/admin/`에 있다.

## Overview

관리자 콘솔은 **조작하는 화면**이다. 고객 화면은 읽는 화면이라 여백이 넓고 글자가 크지만(본문 16.5px, 표 18px·행 72px),
같은 규격을 콘솔에 쓰면 한 화면에 절반밖에 안 들어온다. 그래서 콘솔은 본문 13.5px, 표 행 48px, 입력칸 36px의 고밀도를 쓴다.

바탕은 옅은 회색 캔버스(`{colors.canvas}`)이고 그 위에 흰 카드가 하이라인 보더로 떠 있다. 대표색은 퍼플(`{colors.primary}`) 하나다.
그림자·그라디언트·이너섀도·이모지는 전부 쓰지 않는다. 깊이는 캔버스와 흰 카드의 대비, 1px 하이라인으로만 만든다.

공공기관 운영 도구라 **금액보다 예약·이용 현황을 앞세운다.** 메뉴 이름도 "매출" 대신 "정산"을 쓴다.

**Key Characteristics:**
- 좌측 사이드바 + 상단바 + 본문의 고정 셸. 대시보드는 본문 오른쪽에 활동 패널을 더한 3분할이다.
- 퍼플 솔리드는 주 버튼·진행 막대·차트 주인공에만 쓰고, 활성 메뉴·선택 행·활성 토글은 라벤더 틴트(`{colors.primary-tint}`)로 표시한다.
- 모서리는 거의 전부 12px(`{rounded.lg}`), 입력칸·버튼만 8px.
- 숫자·일시·예약번호는 tabular 숫자로 자릿수를 맞춘다.
- 문구는 한국어 고정이다(다국어 적용 대상 아님).

## Colors

- **Purple** (`{colors.primary}`): 주 버튼, KPI 진행 막대, 예약 차트, 흰 배경 위 강조 글자. 흰 배경에서 대비 5.6:1이라 글자색으로도 쓴다.
- **Lavender** (`{colors.primary-tint}`): 활성 메뉴, 선택된 표 행, 활성 토글, 예약 완료 배지 배경.
- **Canvas · Surface · Surface Soft**: 페이지 바탕 · 카드와 사이드바 · 표 헤더와 검색칸과 hover.
- **Ink · Muted · Subtle**: 숫자·제목·표 강조 · 보조 본문 · 캡션과 플레이스홀더.
- **Hairline · Hairline Strong**: 그림자 대신 쓰는 1px 구분선 · 입력칸 보더.
- **Success · Warning · Error**: 예약 가능 슬롯 · 대기 문의와 정원 마감 · 취소와 실패. 배경은 각 `-tint`(10%), 보더는 30%.
- **Chart**: 예약 퍼플, 이용 완료 에메랄드, 취소 로즈. 보조선은 `subtle`, 그리드는 `hairline`.

### 구현 방식
`app/admin/layout.tsx`가 화면을 `.admin-console`로 감싸고, 이 블록이 고객 화면과 **같은 CSS 변수 이름**을 퍼플 팔레트로 덮어쓴다.
그래서 관리자 코드도 `bg-accent`, `text-muted`, `border-line` 같은 고객 화면과 같은 유틸을 쓰고, 색만 퍼플로 바뀐다.

| 토큰 | CSS 변수 | Tailwind 유틸 |
|---|---|---|
| `primary` | `--accent`, `--accent-strong` | `bg-accent`, `text-accent-strong` |
| `primary-hover` · `primary-tint` · `on-primary` | `--accent-hover` · `--accent-tint` · `--accent-ink` | `hover:bg-accent-hover` · `bg-accent-tint` · `text-accent-ink` |
| `canvas` · `surface` · `surface-soft` | `--background` · `--surface` · `--surface-2` | `bg-background` · `bg-surface` · `bg-surface-2` |
| `ink` · `muted` · `subtle` | `--foreground` · `--muted` · `--subtle` | `text-foreground` · `text-muted` · `text-subtle` |
| `hairline` · `hairline-strong` | `--border-base` · `--border-strong` | `border-line` · `border-line-strong` |
| `success` · `warning` · `error` | `--success` · `--warning` · `--error` | `text-error`, `bg-error/10`, `border-error/30` |

## Typography

- **Pretendard Std Variable** 하나만 쓴다(`next/font/local`, `src/app/fonts/PretendardStdVariable.woff2`, 400~800). 한글 2,350자 서브셋이라 그 밖의 희귀 음절은 시스템 폰트로 대체된다.
- 숫자 셀에는 `.admin-num`(tabular)을 붙인다.

| 토큰 | 크기 · 굵기 | 쓰임 |
|---|---|---|
| `kpi` | 24px · 700 · tabular | KPI 숫자 |
| `page-title` | 20px · 700 | 페이지 제목(설명은 `control` 13px `subtle`) |
| `section-title` | 18px · 700 | 대시보드 구역 제목("예약 현황") |
| `panel-title` · `nav` | 15px · 700 / 500 | 패널 제목 / 사이드바 메뉴(활성 600) |
| `body` | 13.5px · 400 | 본문, 표 셀, 알림 박스 |
| `button` · `control` | 13px · 700 / 400 | 버튼 / 입력칸·셀렉트 |
| `caption` | 12.5px · 400 | 패널 설명, 보조 문구 |
| `label` | 12px · 700 | 표 헤더, KPI 라벨, 표 안 버튼 |
| `label-sm` | 11.5px · 700 | 필드 라벨, 상태 배지 |
| `group-label` | 10.5px · 700 · +0.07em | 사이드바 그룹 이름(운영·고객·성과·기록) |

라벨보다 값이 커야 한다. 라벨은 11.5~12px로 작게, 값과 숫자는 13.5~24px로 크게 둔다.

## Layout

- **셸**: 사이드바 `{spacing.sidebar}`(256px, 흰 배경, 우측 하이라인) + 상단바 `{spacing.topbar}`(64px, 하단 하이라인) + 본문(패딩 16px, 640px 이상 24px). 본문은 화면 전체 폭을 쓴다.
- **사이드바**: 상단 "운영 콘솔" 16px/700, 메뉴 그룹 4개(운영·고객·성과·기록), 하단 "고객 사이트로" 링크. 메뉴 배열은 `admin-nav-items.ts` 하나에서 관리한다.
- **상단바**: 검색칸(256~320×40px) → 빠른 이동 알약(36px) → 우측에 사람 아이콘 원 36px + 마스킹된 이메일 + 로그아웃.
- **페이지 머리**: 제목(`page-title`) + 설명, 아래 20px 간격 뒤 본문.
- **대시보드**: 좌측 본문(KPI 4개 → 추이 차트 + 확인 필요 항목 → 최근 예약 표) + 우측 활동 패널 `{spacing.activity-panel}`(300px). 카드 사이 간격 12~20px.

## Elevation & Depth

평면 디자인이다. 쓰는 단계는 두 가지뿐이다.

| 단계 | 처리 | 쓰임 |
|---|---|---|
| 0 평면 | 그림자·보더 없음 | 캔버스, 사이드바 안 메뉴 |
| 1 하이라인 | 1px `{colors.hairline}` 보더 | 패널, KPI 카드, 표, 활동 패널, 입력칸 |

그림자는 드롭다운처럼 화면 위에 잠깐 뜨는 요소에만 예외로 허용한다.

## Shapes

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `{rounded.sm}` | 6px | 표 안 인라인 버튼(28px) |
| `{rounded.md}` | 8px | 버튼, 입력칸, 셀렉트, 토글 |
| `{rounded.lg}` | 12px | 패널, KPI 카드, 표 틀, 메뉴 항목, 검색칸, 알림 박스 |
| `{rounded.full}` | 9999px | 상태 배지, 진행 막대, 아바타 원 |

아이콘은 얇은 라인 SVG(`admin-nav-icons.tsx`)이고, 프로필은 이니셜 아바타가 아니라 사람 모양 라인 아이콘이다.

## Components

### Shell & Navigation
- `nav-item` · `nav-item-active`: 44px, 아이콘 20px + 글자. 활성은 라벤더 배경 + 퍼플 글자 600. 퍼플 솔리드로 채우지 않는다.
- `topbar-search`: 연회색 배경 + 하이라인 보더 + 돋보기 아이콘. 빠른 이동 알약은 활성일 때 라벤더.

### Panels & KPI
- `panel`: 흰 배경 + 하이라인 + 12px. 제목 줄 오른쪽에 버튼·필터를 둘 수 있다.
- `kpi-card`: 라벨(`label`, `muted`) → 숫자(`kpi`) → 진행 막대(`kpi-progress`, 채움 `kpi-progress-fill`) → 보조 숫자(12px `subtle`).
- 대시보드에 표시하는 숫자는 서버가 실제로 주는 값만 쓴다. 목표 대비 달성률·전일 대비 증감처럼 근거 API가 없는 지표는 넣지 않는다.

### Tables
- `table-header` · `table-cell`: 표 전체를 흰 카드(12px, 하이라인)에 담는다. 세로 구분선 없이 가로선만 쓰고, 행 hover는 `surface-soft` 60%, 상세를 연 행은 `table-row-selected`.
- 상태 배지 5종: `status-reserved`(예약 완료) · `status-cancelled`(취소) · `status-used`(이용 완료 · 답변 완료) · `status-pending`(답변 대기 · 정원 마감) · `status-available`(예약 가능 슬롯). 24px 알약에 같은 색의 30% 보더를 두른다.
- 페이지네이션은 고객 화면과 같은 부품(`board-pagination`)을 `compact` 여백으로 표 카드 안에 붙인다.

### Controls & Buttons
- `button`(조회·저장 등 기본) · `button-outline` · `button-inline`(표 안 이용 완료·취소). 구현은 `ui/app-button`의 `console`·`xs` 크기.
- `control`: 36px 입력칸·셀렉트, 보더 `hairline-strong`, focus 시 보더 `primary` + 20% 링. 필드 라벨(`field-label`)은 칸 위 4px.
- `toggle-active`: 필터·기간 토글의 선택 상태. 비활성은 흰 배경 + `hairline-strong` 보더 + `muted` 글자.

### Feedback & Charts
- `notice-error` · `notice-warning`: 12px 박스에 30% 보더. API·검증 실패는 항상 이 박스로 드러낸다.
- 차트: 예약 추이는 퍼플·에메랄드·로즈 선, 정산 막대는 퍼플, 비교선은 `subtle`. 축 글자 11px.

## Do's and Don'ts

### Do
- 패널·표·컨트롤 규격은 `admin-ui.tsx`의 부품을 쓴다. 화면마다 다시 정의하지 않는다.
- 퍼플 솔리드는 한 화면의 핵심 버튼과 데이터 강조에만 쓰고, 선택 상태는 라벤더 틴트로 표시한다.
- 실패는 `notice-error`로 드러낸다. 조용히 빈 값을 보여주지 않는다.
- 숫자 셀은 tabular로 맞추고, 금액·수량은 오른쪽 정렬한다.

### Don't
- 그림자·그라디언트·이너섀도·이모지를 쓰지 않는다.
- 고객 화면 규격(18px 표, 72px 행, 48px 입력칸, 게시판 세로 구분선)을 쓰지 않는다.
- 금액을 대시보드의 주인공으로 두지 않는다. "매출" 대신 "정산"이라고 쓴다.
- 이니셜 아바타를 쓰지 않는다.

## Responsive Behavior

| 구간 | 폭 | 바뀌는 것 |
|---|---|---|
| mobile | 640px 미만 | 본문 패딩 16px, KPI 2열, 표는 최소 폭(720px 등)에서 가로 스크롤 |
| sm | 640px 이상 | 본문 패딩 24px, 상단바 이메일 표시 |
| md | 768px 이상 | 상단바 빠른 이동 표시 |
| lg | 1024px 이상 | 사이드바 고정 표시(미만은 상단바 메뉴 버튼 → 펼침 메뉴), KPI 4열 |
| xl | 1280px 이상 | 대시보드 우측 활동 패널 표시 |

## Iteration Guide

1. 관리자 화면은 본문만 만든다. 사이드바·상단바·캔버스는 `admin-shell.tsx`가 그린다.
2. 새 메뉴는 `admin-nav-items.ts` 배열에 추가하고, 아이콘은 `admin-nav-icons.tsx`에 그린다.
3. 색은 고객 화면과 같은 유틸을 쓴다(`.admin-console`이 퍼플로 바꿔 준다). hex를 직접 쓰지 않는다. 예외는 차트 라이브러리에 넘기는 색(`admin-charts.tsx`)뿐이다.

| 컴포넌트 | 구현 |
|---|---|
| `page` · `sidebar` · `nav-*` · `topbar*` | `src/components/admin/admin-shell.tsx`, `admin-nav-items.ts`, `admin-nav-icons.tsx` |
| `panel` · `table-*` · `control` · `field-label` · `toggle-active` · `notice-error` | `admin/admin-ui.tsx` (`AdminPanel`, `AdminTable`, `AdminTd`, `AdminTr`, `ADMIN_CONTROL_CLASS` 등) |
| `button*` | `ui/app-button.tsx` (size `console` · `xs`) |
| `status-*` | `admin/admin-reservations-shared.ts` 외 화면별 `statusBadgeStyles` |
| `kpi-*` · 활동 패널 | `admin/admin-dashboard.tsx` |
| `chart-*` | `admin/admin-charts.tsx` |

4. 값을 바꿀 때는 이 파일과 `globals.css .admin-console`을 함께 고친다.
5. 고친 뒤 `npx -p @google/design.md designmd lint DESIGN-admin.md`로 검사한다.

## Known Gaps

- **대비 경고 4건(lint)**. 토큰은 현재 화면값 그대로 두고 기록만 한다. 모두 AA 기준(4.5:1)에 조금 못 미친다.
  - `page-description` 4.25:1: 캔버스 위 `subtle` 글자. `subtle`은 흰 카드 위에서만 기준을 넘는다. `muted`를 쓰거나 `subtle`을 조금 진하게 바꾸면 해소된다.
  - `status-available` 4.05:1, `status-pending` · `notice-warning` 4.39:1: 10% 틴트 배경 위 상태색 글자. 글자색을 한 단계 진하게 하면 해소된다.
- **상태 배지 색이 화면마다 정의돼 있다.** 예약·문의·슬롯 배지가 각 파일에 따로 있어, 한 곳(SSOT)으로 모으는 정리가 남아 있다.
- **코드 주석이 옛 상태를 말한다.** `admin-ui.tsx` 상단("accent 토큰은 고객 화면과 같은 SSOT")과 `AdminTd`("JetBrains Mono") 주석은 지금의 퍼플 스코프·Pretendard와 다르다.
- **최근 예약 표에 금액 열이 남아 있다.** 공공기관 톤 원칙(금액 대신 인원)과 다르다.
- **대시보드 활동 패널**은 사이드바처럼 평면으로 두려던 설계와 달리 하이라인 카드로 구현돼 있다.
- 이 형식은 테마를 파일마다 하나만 표현한다. 고객 화면 변수를 덮어쓰는 실제 구현 방식은 위 "구현 방식" 표로만 설명한다.
