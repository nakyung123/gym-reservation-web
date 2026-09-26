---
version: alpha
name: 서울체육예약
description: "공공 체육시설 예약 서비스. 옅은 회청색 캔버스 위에 흰 카드를 놓고 네이비 한 색을 점처럼 쓰는 공공기관 신뢰형 인터페이스다. 큰 글자와 게시판형 목록으로 전 연령(특히 중장년)이 읽기 쉽게 하고, 히어로 일러스트·시설 사진·마스코트로 딱딱함을 덜어낸다. 고객 화면(네이비)과 인증 화면(무채색) 두 표면으로 나뉘며, 관리자 콘솔은 DESIGN-admin.md에 따로 정의한다."

colors:
  # 고객 화면 — 구현: src/app/globals.css :root
  primary: "#2745b3"
  primary-hover: "#1e3690"
  primary-strong: "#1e3a8a"
  primary-tint: "#eef1fb"
  on-primary: "#ffffff"
  canvas: "#f8fafc"
  surface: "#ffffff"
  surface-soft: "#f1f5f9"
  ink: "#1f2937"
  ink-strong: "#020618"
  muted: "#475569"
  subtle: "#94a3b8"
  hairline: "#e2e8f0"
  hairline-strong: "#cbd5e1"
  success: "#15803d"
  warning: "#b45309"
  error: "#dc2626"
  error-tint: "#fce9e9"
  inverse-canvas: "#0f172b"
  inverse-ink: "#ffffff"
  inverse-muted: "#90a1b9"
  # 인증 화면(/login, /signup, /reset-password)
  auth-primary: "#121212"
  auth-ink: "#252525"
  auth-accent: "#2563eb"
  auth-hairline: "#d0d0d0"
  auth-placeholder: "#9b9b9b"

typography:
  display:       { fontFamily: Noto Sans KR, fontSize: 46px, fontWeight: 800, lineHeight: 1.26, letterSpacing: -0.025em }
  page-title:    { fontFamily: Noto Sans KR, fontSize: 32px, fontWeight: 700, lineHeight: 1.6 }
  section-title: { fontFamily: Noto Sans KR, fontSize: 31px, fontWeight: 800, lineHeight: 1.6, letterSpacing: -0.02em }
  tab:           { fontFamily: Noto Sans KR, fontSize: 22px, fontWeight: 700, lineHeight: 1.6 }
  price:         { fontFamily: Noto Sans KR, fontSize: 21px, fontWeight: 800, lineHeight: 1.6, fontFeature: '"tnum" 1' }
  title-md:      { fontFamily: Noto Sans KR, fontSize: 20px, fontWeight: 700, lineHeight: 1.6 }
  card-title:    { fontFamily: Noto Sans KR, fontSize: 19.5px, fontWeight: 700, lineHeight: 1.6 }
  table-head:    { fontFamily: Noto Sans KR, fontSize: 18px, fontWeight: 700, lineHeight: 1.6 }
  body-lg:       { fontFamily: Noto Sans KR, fontSize: 18px, fontWeight: 400, lineHeight: 1.6 }
  nav:           { fontFamily: Noto Sans KR, fontSize: 17px, fontWeight: 700, lineHeight: 1.6 }
  body:          { fontFamily: Noto Sans KR, fontSize: 16.5px, fontWeight: 400, lineHeight: 1.6, fontFeature: '"tnum" 1' }
  button:        { fontFamily: Noto Sans KR, fontSize: 15.5px, fontWeight: 700, lineHeight: 1.6 }
  body-md:       { fontFamily: Noto Sans KR, fontSize: 15px, fontWeight: 400, lineHeight: 1.65 }
  body-sm:       { fontFamily: Noto Sans KR, fontSize: 14.5px, fontWeight: 400, lineHeight: 1.6 }
  label-lg:      { fontFamily: Noto Sans KR, fontSize: 14px, fontWeight: 600, lineHeight: 1.6 }
  eyebrow:       { fontFamily: Noto Sans KR, fontSize: 13.5px, fontWeight: 700, lineHeight: 1.6, letterSpacing: 0.06em }
  label-md:      { fontFamily: Noto Sans KR, fontSize: 13px, fontWeight: 600, lineHeight: 1.6 }
  caption:       { fontFamily: Noto Sans KR, fontSize: 13px, fontWeight: 400, lineHeight: 1.6 }
  label-sm:      { fontFamily: Noto Sans KR, fontSize: 12.5px, fontWeight: 700, lineHeight: 1.6 }
  auth-title:    { fontFamily: Noto Sans KR, fontSize: 23px, fontWeight: 700, lineHeight: 1.3 }
  auth-button:   { fontFamily: Noto Sans KR, fontSize: 18px, fontWeight: 500, lineHeight: 1.6 }

rounded:
  xs: 3px
  sm: 6px
  md: 8px
  control: 10px
  lg: 12px
  xl: 16px
  feature: 20px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  board-gap: 60px
  section: 72px
  header: 76px
  container: 1440px
  gutter: 32px
  gutter-mobile: 20px
  card-columns: 3

components:
  header:                 { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.nav}", height: 76px }
  divider:                { backgroundColor: "{colors.hairline}", height: 1px }
  breadcrumb-separator:   { textColor: "{colors.hairline-strong}", typography: "{typography.caption}" }
  helper-warning:         { backgroundColor: "{colors.surface}", textColor: "{colors.warning}", typography: "{typography.label-lg}" }
  footer:                 { backgroundColor: "{colors.inverse-canvas}", textColor: "{colors.inverse-muted}", typography: "{typography.body-sm}", padding: 44px 32px 30px }
  button-primary:         { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", height: 44px, padding: 0 19px }
  button-primary-hover:   { backgroundColor: "{colors.primary-hover}", textColor: "{colors.on-primary}" }
  button-primary-lg:      { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", height: 48px, padding: 0 28px }
  button-outline:         { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", height: 44px, padding: 0 19px }
  button-outline-hover:   { backgroundColor: "{colors.surface}", textColor: "{colors.primary-strong}" }
  button-danger:          { backgroundColor: "{colors.error}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", height: 44px, padding: 0 19px }
  input-field:            { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body-md}", rounded: "{rounded.control}", height: 48px, padding: 0 14px }
  input-field-disabled:   { backgroundColor: "{colors.surface-soft}", textColor: "{colors.subtle}" }
  field-label:            { textColor: "{colors.ink}", typography: "{typography.label-sm}" }
  filter-panel:           { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", padding: 24px }
  toggle-chip:            { backgroundColor: "{colors.surface}", textColor: "{colors.muted}", typography: "{typography.label-lg}", rounded: "{rounded.full}", height: 40px, padding: 0 12px }
  toggle-chip-active:     { backgroundColor: "{colors.primary-tint}", textColor: "{colors.primary-strong}" }
  card:                   { backgroundColor: "{colors.surface}", textColor: "{colors.ink-strong}", typography: "{typography.card-title}", rounded: "{rounded.lg}", padding: 20px }
  chip:                   { backgroundColor: "{colors.surface-soft}", textColor: "{colors.muted}", typography: "{typography.label-md}", rounded: "{rounded.sm}", padding: 5px 11px }
  badge-available:        { backgroundColor: "{colors.surface}", textColor: "{colors.success}", typography: "{typography.label-sm}", rounded: "{rounded.full}", padding: 5px 11px }
  status-reserved:        { backgroundColor: "{colors.primary-tint}", textColor: "{colors.primary-strong}", typography: "{typography.label-sm}", rounded: "{rounded.full}" }
  status-cancelled:       { backgroundColor: "{colors.error-tint}", textColor: "{colors.error}", typography: "{typography.label-sm}", rounded: "{rounded.full}" }
  status-used:            { backgroundColor: "{colors.surface-soft}", textColor: "{colors.muted}", typography: "{typography.label-sm}", rounded: "{rounded.full}" }
  tab:                    { backgroundColor: "{colors.canvas}", textColor: "{colors.muted}", typography: "{typography.tab}", padding: 16px 0 }
  tab-active:             { backgroundColor: "{colors.canvas}", textColor: "{colors.primary-strong}", typography: "{typography.tab}", padding: 16px 0 }
  board-table-header:     { backgroundColor: "{colors.surface-soft}", textColor: "{colors.ink}", typography: "{typography.table-head}", height: 72px }
  board-table-row:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-lg}", height: 72px }
  board-table-row-pinned: { backgroundColor: "{colors.primary-tint}", textColor: "{colors.ink}" }
  search-bar:             { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.full}", height: 68px, width: 646px }
  pagination-item:        { backgroundColor: "{colors.canvas}", textColor: "{colors.muted}", typography: "{typography.label-lg}", rounded: "{rounded.md}", size: 40px }
  pagination-item-active: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.label-lg}", rounded: "{rounded.md}", size: 40px }
  time-slot:              { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.label-lg}", rounded: "{rounded.sm}", height: 56px }
  time-slot-selected:     { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}" }
  time-slot-disabled:     { backgroundColor: "{colors.surface-soft}", textColor: "{colors.subtle}" }
  collapsible-section:    { backgroundColor: "{colors.surface}", textColor: "{colors.ink-strong}", typography: "{typography.title-md}", rounded: "{rounded.xl}", padding: 24px 32px }
  alert-modal:            { backgroundColor: "{colors.surface}", textColor: "{colors.ink-strong}", typography: "{typography.title-md}", rounded: "{rounded.xl}", width: 312px, padding: 28px 24px }
  auth-input:             { backgroundColor: "{colors.surface}", textColor: "{colors.auth-ink}", rounded: "{rounded.xs}", height: 50px, padding: 0 12px }
  auth-input-placeholder: { textColor: "{colors.auth-placeholder}" }
  auth-step-connector:    { textColor: "{colors.auth-hairline}" }
  auth-button-primary:    { backgroundColor: "{colors.auth-primary}", textColor: "{colors.on-primary}", typography: "{typography.auth-button}", rounded: "{rounded.xs}", height: 60px }
  auth-button-secondary:  { backgroundColor: "{colors.auth-accent}", textColor: "{colors.on-primary}", typography: "{typography.auth-button}", rounded: "{rounded.xs}", height: 60px }
---

# 서울체육예약 DESIGN.md

> **미리보기**: [nakyung123.github.io/gym-reservation-web](https://nakyung123.github.io/gym-reservation-web/) — 토큰을 색·글꼴·컴포넌트로 그려 보여준다. 이 파일을 `main`에 푸시하면 자동으로 갱신된다.

토큰(위 front matter)이 규범값이고, 본문은 그 쓰임과 이유를 설명한다. 구현은 `src/app/globals.css`와 `src/components/ui/`에 있다.
현재 코드와 토큰의 차이는 [`docs/design-audit.md`](docs/design-audit.md)에 실측으로 기록돼 있다.
**관리자 콘솔(`/admin/*`)은 별도 디자인 시스템이다. [`DESIGN-admin.md`](DESIGN-admin.md)를 본다.**

## Overview

서울체육예약은 집 근처 공공 체육시설을 찾고 예약하는 서비스다. 사용자는 전 연령이고, 특히 중장년이 많다.
그래서 첫인상은 **깔끔하고 믿을 수 있는 공공 서비스**여야 한다. 화려함보다 명확함, 밀도보다 여백을 택한다.

화면의 90%는 무채색이다. 옅은 회청색 캔버스(`{colors.canvas}`) 위에 흰 카드와 패널이 놓이고, 대표색 네이비(`{colors.primary}`)는
버튼·선택 상태·제목 강조에만 점처럼 쓴다. 글자는 크게 쓴다. 본문 기본이 16.5px, 게시판 표가 18px, 탭이 22px이다.
목록형 화면은 공공기관 게시판 문법(굵은 상단선, 회색 헤더, 세로 구분선)을 따른다.
딱딱함은 이미지로 덜어낸다. 홈 히어로는 배드민턴 코트 일러스트, 시설 카드는 실사진, 로그인과 챗 위젯에는 마스코트가 있다.

| 표면 | 범위 | 인상 | 대표색 · 폰트 |
|---|---|---|---|
| 고객 화면 | 홈·시설·예약·마이페이지·공지·FAQ | 공공 포털, 넓은 여백, 큰 글자 | 네이비 · Noto Sans KR |
| 인증 화면 | 로그인·회원가입·비밀번호 찾기 | 모바일 앱형 단일 컬럼 | 검정 + 블루 · Noto Sans KR |

**Key Characteristics:**
- 무채 캔버스 + 대표색 하나. 배경을 네이비 틴트로 도배하지 않는다. 틴트는 "선택·강조" 의미가 있을 때만 쓴다.
- 텍스트 버튼은 전부 알약형이다(인증 화면 제외). 사각 버튼은 쓰지 않는다.
- 이모지 없음. 아이콘은 전부 인라인 라인 SVG.
- 상단 유틸은 아이콘 대신 텍스트 라벨(`로그인 | 회원가입 | KR`).
- 그림자는 떠 있는 요소(카드·팝오버·모달)에만 옅게. 패널·표·입력칸은 1px 하이라인으로 구분한다.
- 목록은 게시판 표, 페이지는 표준 셸(breadcrumb → 제목 → 부제 → 본문)로 통일한다.

## Colors

### 고객 화면
- **Navy** (`{colors.primary}`): 솔리드 버튼, 활성 페이지 번호, 선택된 시간·날짜, 탭 밑줄. 항상 흰 글씨(`{colors.on-primary}`)와 짝.
- **Deep Navy** (`{colors.primary-strong}`): 흰 배경 위의 네이비 글자. 히어로 제목, 활성 탭, eyebrow, 링크 hover.
- **Navy Tint** (`{colors.primary-tint}`): 선택·강조 배경. 주요공지 행, FAQ 답변, 활성 토글, 예약 합계 바.
- **Canvas · Surface · Surface Soft**: 페이지 배경 · 카드와 패널 · 표 헤더와 태그와 비활성 상태.
- **Ink · Ink Strong · Muted · Subtle**: 본문 · 큰 제목과 카드 제목 · 부제와 설명 · 플레이스홀더와 단위.
- **Hairline · Hairline Strong**: 카드와 표의 보더 · 입력칸과 토글의 보더.
- **Success · Warning · Error**: 예약 가능 · 경고 · 실패와 취소. 배경은 10% 틴트(`{colors.error-tint}`), 보더는 30% 틴트로 쓴다.
- **Inverse**: 푸터 전용 다크 네이비(`{colors.inverse-canvas}`)와 그 위 글자.

**2톤 규칙.** 솔리드 배경 + 흰 글씨는 `primary`, 흰 배경 위 작은 글자·아이콘은 더 진한 `primary-strong`. 대표색을 바꿀 때 이 분리를 지켜야 대비가 유지된다.

### 인증 화면
- 인증은 검정(`{colors.auth-primary}`) 주 버튼과 블루(`{colors.auth-accent}`) 보조 버튼을 쓰는 무채 팔레트다. 소셜 로그인 원(카카오 `#FEE500`, 네이버 `#03C75A` 등)은 브랜드 색 예외.

### 토큰과 코드 연결
| 토큰 | CSS 변수 (`globals.css`) | Tailwind 유틸 |
|---|---|---|
| `primary` · `primary-hover` · `primary-strong` · `primary-tint` · `on-primary` | `--accent` · `--accent-hover` · `--accent-strong` · `--accent-tint` · `--accent-ink` | `bg-accent` · `hover:bg-accent-hover` · `text-accent-strong` · `bg-accent-tint` · `text-accent-ink` |
| `canvas` · `surface` · `surface-soft` | `--background` · `--surface` · `--surface-2` | `bg-background` · `bg-surface` · `bg-surface-2` |
| `ink` · `muted` · `subtle` | `--foreground` · `--muted` · `--subtle` | `text-foreground` · `text-muted` · `text-subtle` |
| `hairline` · `hairline-strong` | `--border-base` · `--border-strong` | `border-line` · `border-line-strong` |
| `success` · `warning` · `error` (+ 틴트) | `--success` · `--warning` · `--error` | `text-error` · `bg-error/10` · `border-error/30` |
| `ink-strong` · `inverse-*` | Tailwind 기본 팔레트 | `text-slate-950` · `bg-slate-900` · `text-slate-400` |

## Typography

- **Noto Sans KR** (`next/font/google`, 400·500·700·800): 고객·인증 화면. 예약번호·금액도 이 폰트 + tabular 숫자.
- 전역 body: 16.5px · 줄간격 1.6 · `word-break: keep-all` · `font-feature-settings: "tnum" 1`.

| 토큰 | 크기 · 굵기 | 쓰임 |
|---|---|---|
| `display` | 46px · 800 (모바일 34px) | 홈 히어로 제목 (`primary-strong`) |
| `page-title` | 32px · 700 (모바일 28px) | 모든 페이지 h1 |
| `section-title` | 31px · 800 | 홈 섹션 제목 |
| `tab` | 22px · 700, 비활성 500 (모바일 18px) | 탭 |
| `price` | 21px · 800 · tabular | 가격 숫자 (`원` 15px/700, 단위 13.5px `subtle` 뒤따름) |
| `title-md` | 20px · 700 | 접이식 섹션·알림 모달 제목 |
| `card-title` | 19.5px · 700 | 시설 카드 제목 |
| `table-head` · `body-lg` | 18px · 700 / 400 | 게시판 헤더 / 게시판 셀·공지 제목 |
| `nav` | 17px · 700 | GNB |
| `body` | 16.5px · 400 | 기본 본문 |
| `button` | 15.5px · 700 | 버튼 |
| `body-md` | 15px · 400 · 줄간격 1.65 | 페이지 부제, 입력칸, 드롭다운 옵션 |
| `body-sm` | 14.5px · 400 | 주소, 푸터, 헤더 유틸(600) |
| `label-lg` | 14px · 600 | 토글, 페이지 번호, 시간 슬롯 |
| `eyebrow` | 13.5px · 700 · +0.06em | 영문 대문자 섹션 라벨(`GUIDE`, `FACILITIES`) |
| `label-md` · `caption` | 13px · 600 / 400 | 종목 태그 / breadcrumb |
| `label-sm` | 12.5px · 700 | 필드 라벨, 배지 |

인증 화면은 `auth-title`(23px/700)과 `auth-button`(18px/500)을 쓴다.

**원칙**
- 굵기는 400·500·700·800 네 가지뿐이다(로딩한 굵기). 800은 `display`·`section-title`·`price`·로고에만.
- 큰 제목만 자간을 줄이고(-0.02~-0.025em), 영문 eyebrow는 벌린다(+0.06em). 본문은 0.
- 글자를 작게 줄여 밀도를 올리지 않는다. 15px 미만은 라벨·캡션·보조 정보에만 쓴다.

## Layout

- **컨테이너**: 최대 `{spacing.container}`(1440px), 좌우 `{spacing.gutter}`(32px), 모바일 `{spacing.gutter-mobile}`(20px).
- **페이지 셸**: 상하 48px(모바일 40px) → breadcrumb(`caption`) → 16px → h1(`page-title`) → 8px → 부제(`body-md`, `muted`) → 32~36px → 본문.
- **섹션 리듬**: 홈 섹션 상하 `{spacing.section}`(72px), 섹션 제목 묶음 아래 30px. 게시판 페이지는 부제·검색바·표 사이 `{spacing.board-gap}`(60px), 탭과 본문 사이 72px.
- **그리드**: 시설 카드 1→2→`{spacing.card-columns}`열(간격 24px), 안내 카드 1→2→4열(20px), 필터 `1fr 1fr 1.3fr auto`.
- **좁은 컬럼**: 예약하기·예약 상세 1200px(본문 + 우측 요약 378px, sticky), 회원정보 폼 800px, 달력 752px, 인증 520px(내용 480px).
- **크롬**: 헤더 `{spacing.header}`(76px) sticky(홈만 투명에서 시작해 스크롤·hover 시 솔리드), 푸터는 다크 네이비.

## Elevation & Depth

| 단계 | 처리 | 쓰임 |
|---|---|---|
| 0 평면 | 그림자·보더 없음 | 히어로, 예약 흐름의 흰 카드, 섹션 배경 |
| 1 하이라인 | 1px `{colors.hairline}` 보더 | 필터 패널, 게시판 표, 입력칸, 안내 카드 |
| 2 카드 | `0 1px 3px rgba(15,23,42,.06)` → hover `0 4px 16px rgba(15,23,42,.09)` | 시설 카드 |
| 3 팝오버 | `0 8px 24px rgba(15,23,42,.12)` | 드롭다운, 메가메뉴, 언어 메뉴 |
| 4 모달 | `shadow-xl` + 검정 40~50% 딤 | 알림 모달, QR 모달, 챗 창 |

깊이는 그림자보다 **캔버스(회청) 위 흰 표면**으로 만든다. 그라디언트는 히어로 가독성 베일과 사진 대체 이미지에만 쓴다.

## Shapes

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `{rounded.xs}` | 3px | 인증 화면 입력칸·버튼 |
| `{rounded.sm}` | 6px | 태그, 시간 슬롯, 달력 날짜 |
| `{rounded.md}` | 8px | 드롭다운 목록, 페이지 번호 |
| `{rounded.control}` | 10px | 필터·검색 입력칸 |
| `{rounded.lg}` | 12px | 카드, 선택 목록 항목 |
| `{rounded.xl}` | 16px | 패널, 접이식 섹션, 모달, 상세 사진 |
| `{rounded.feature}` | 20px | 홈 행사 카드, 이용안내 이미지 |
| `{rounded.full}` | 9999px | **모든 텍스트 버튼**, 정렬 토글, 검색바, 배지, 원형 아이콘 버튼 |

- **아이콘**: 인라인 라인 SVG, stroke 1.4~2.4, 끝과 모서리 round, 주로 16·18·20·24px. 예외는 홈 "이렇게 이용하세요"의 듀오톤 아이콘 4개뿐이다.
- **이미지**: 시설 썸네일 높이 176px, 상세 사진 4:3, 이용안내 3:2, 모두 `object-cover`. 사진이 없으면 `primary-tint → surface-soft` 그라데이션 + 건물 아이콘.
- **로고**: 이미지가 아닌 텍스트 워드마크 `서울체육예약` + 우상단 ㄱ자 마크, 800, `#2745B3`.

## Components

### Buttons
- `button-primary` · `button-outline` · `button-danger`, 큰 버전 `button-primary-lg`. 구현은 `ui/app-button`의 `Button`·`ButtonLink` 하나뿐이다.
- outline 보더는 `hairline-strong`, hover 시 보더가 `primary`로 바뀐다. focus는 2px `primary` 링 + 2px 간격. disabled는 투명도 60%.
- **모양은 알약형 하나다.** 기본·아웃라인·위험·큰 버튼, 정렬 토글까지 모든 텍스트 버튼은 `{rounded.full}`이다. 사각은 인증 화면(3px)과, 버튼이 아닌 선택 칸(시간 슬롯·달력 날짜·페이지 번호)에만 남긴다.
- 높이는 `button-primary` 44px, `button-primary-lg` 48px 두 가지를 기본으로 한다. 페이지 하단에 단독으로 놓이는 마무리 버튼(시설 상세 `예약하기` 등)은 큰 버전을 쓴다.

### Inputs & Filters
- `input-field`: 보더 `hairline-strong`, focus 시 보더 `primary` + `primary` 20% 링, 라벨(`field-label`)과 칸 사이 6px.
- 네이티브 `<select>`는 쓰지 않는다. `ui/select-menu`: 목록은 흰 배경·`md` 모서리·3단계 그림자, 옵션 15px, 선택 옵션은 `primary-strong` 600.
- `filter-panel`: 하이라인 보더, 그림자 없음. 아래 하이라인 구분선 뒤에 우측 정렬 `toggle-chip`(보더 `hairline-strong`, 활성 시 보더 `primary`).

### Cards, Chips & Status
- `card`(시설 카드): 하이라인 + 2단계 그림자. 썸네일 → 본문 20px: 제목 → 주소(`body-sm`, 핀 아이콘) → `chip` 목록(간격 7px) → 구분선 → `price` + `button-primary`(좌우 32px). 썸네일 좌상단에 `badge-available`.
- 안내 카드(홈 "이렇게 이용하세요"): 카드와 같은 모양이지만 그림자·hover가 없다(클릭 불가).
- `status-reserved` · `status-cancelled` · `status-used`: 예약 상태 표현의 기준은 `reservation/reservation-ticket.tsx`의 `reservationStatusBadgeStyles`다. 같은 상태는 어느 화면에서나 같은 배지.

### Navigation
- `header`: 로고(24px) → 44px → GNB(`nav`, 좌우 20px) → 우측 유틸(`body-sm` 600, 13px 세로 구분선). GNB hover는 글자 `primary-strong` + 하단 3px `primary` 밑줄. `시설 찾기`는 hover 메가메뉴(400px, 3단계 그림자).
- breadcrumb: `caption`, 구분자 `/`는 `hairline-strong`, 현재 위치는 600 `ink`.
- `footer`: 다크 네이비, 컬럼 제목 15.5px/700, 고객센터 전화 23px/800.

### Boards (목록형 화면)
- `tab` · `tab-active`: 균등 분할 그리드. 활성은 2px `primary` 밑줄 + 700. 탭 줄 아래 1px 하이라인은 화면 끝까지 늘인다.
- 게시판 표: 상단 2px `ink`(80%) 선 → `board-table-header` → `board-table-row`(하이라인 행 구분, 셀 사이 세로 하이라인, hover `surface-soft`). 주요공지는 `board-table-row-pinned` + `primary` 알약 배지.
- `search-bar`: 2px 검정 보더 알약 + 48px 원형 검정 버튼 + 좌측 필드 드롭다운(전체/제목/내용).
- `pagination-item`: 하이라인 보더, 처음·이전·다음·끝은 chevron. 게시판 아래 여백 80px / 56px.

### Reservation
- `collapsible-section`: 보더 없는 흰 카드 + 우측 chevron. 안의 선택 목록 항목은 `lg` 모서리·하이라인 보더, 선택 시 `primary` 보더 + `primary-tint`.
- `time-slot`: 4열·16px 간격, 기본 보더 `hairline-strong`. 선택 `time-slot-selected`, 마감·지난 시간 `time-slot-disabled`(취소선 없음), 내 예약과 겹치는 시간은 `primary-tint` + `primary-strong`.
- 달력 날짜 칸: 56px·`sm` 모서리, 선택 `primary`, 일요일 `error`, 선택 불가 `subtle`.
- 우측 요약: 흰 `xl` 카드, 제목 24px/700, 합계 바 54px `primary-tint`.

### Feedback
- `alert-modal`: 모든 단순 알림의 기준(`ui/alert-modal`). 딤 검정 40%, 제목 "알림" + 메시지 16px, 버튼은 텍스트형(확인 `primary-strong`).
- 오류 박스: `error-tint` 배경 + `error` 30% 보더 + `error` 글자 600, `role="alert"`.
- 빈 상태: 점선 `hairline-strong` 카드에 "왜 비었는지 + 다음 행동"을 함께 둔다.

### Auth
- 520px 단일 컬럼: 61px 상단 바 → 마스코트 160px → 제목(`auth-title`) → `auth-input`(보더 `auth-hairline`, 플레이스홀더 `auth-placeholder`, 칸 사이 13px) → `auth-button-primary` → `auth-button-secondary` → 80px 원형 소셜 로그인 4개.
- **색은 지금 스타일을 유지한다.** 검정 주 버튼(`auth-primary`) + 블루 보조색(`auth-accent`). 블루는 흰 글씨 대비 기준(4.5:1)을 넘도록 `#2563EB`로 정했다(기존 `#3B82F6`은 3.68:1). 인증 화면은 사이트 안의 별도 스타일이라 고객 화면의 네이비·알약형 규칙을 적용하지 않는다.

## Do's and Don'ts

### Do
- `primary`는 한 화면의 핵심 행동과 선택 상태에만 쓴다.
- 버튼·드롭다운·페이지네이션·알림은 `src/components/ui/`의 부품을 쓴다.
- 목록은 게시판 표 패턴으로, 페이지는 표준 셸로 만든다.
- 흰 배경 위 네이비 글자는 `primary-strong`, 솔리드 위 흰 글자는 `primary`와 짝지운다.
- 오류와 빈 상태에는 이유와 다음 행동을 함께 둔다.
- 새 색·크기가 필요하면 먼저 이 파일과 `globals.css`에 토큰을 추가한 뒤 쓴다.

### Don't
- 사각 텍스트 버튼을 만들지 않는다(인증 화면 제외).
- 이모지를 쓰지 않는다.
- 컴포넌트에 hex 값을 직접 쓰지 않는다.
- 패널·표·입력칸에 그림자를 주지 않는다.
- 네이티브 `<select>`를 쓰지 않는다.
- 같은 상태(예약 완료·취소·이용 완료, 오류)를 화면마다 다른 색·문구로 표현하지 않는다.
- 고객 화면 규격과 관리자 콘솔 규격(`DESIGN-admin.md`)을 섞지 않는다.

## Responsive Behavior

| 구간 | 폭 | 바뀌는 것 |
|---|---|---|
| mobile | 640px 미만 | 좌우 20px, 1열, 제목 축소(`display` 34px, `page-title` 28px, `tab` 18px), 필터 세로 쌓기, 푸터 2열 |
| sm | 640px 이상 | 좌우 32px, 카드 2열, 제목 원래 크기 |
| lg | 1024px 이상 | GNB 표시(미만은 44px 햄버거), 카드 3열·안내 카드 4열 |
| xl | 1280px 이상 | 홈 행사 섹션 2단(사진 패널 + 캐러셀) |

- **터치 대상**: 모바일 메뉴 행·푸터 링크 44px 이상, 입력칸 48px.
- **접힘**: GNB → 전체 폭 드로어, 예약 2단 → 1단, 게시판 표는 최소 폭 560px에서 가로 스크롤.

## Iteration Guide

1. 새 화면은 먼저 고객 화면인지 인증 화면인지 정한다. 관리자 화면이면 [`DESIGN-admin.md`](DESIGN-admin.md)를 본다.
2. 컴포넌트는 토큰 이름으로 부르고, 아래 구현 위치를 쓴다.

| 컴포넌트 | 구현 |
|---|---|
| `button-*` | `src/components/ui/app-button.tsx` (variant · size) |
| 드롭다운 | `ui/select-menu.tsx` |
| `pagination-item` | `ui/board-pagination.tsx` |
| `search-bar` | `home/search-bar.tsx` |
| `alert-modal` · `collapsible-section` | `ui/alert-modal.tsx` · `ui/collapsible-section.tsx` |
| `status-*` | `reservation/reservation-ticket.tsx` |
| `card` · `chip` · `badge-available` | `gym/facility-card.tsx` · `gym/gym-card.tsx` |

3. 색은 Colors의 "토큰과 코드 연결" 표대로 Tailwind 유틸로 쓴다.
4. 값을 바꿀 때는 front matter와 `globals.css`를 함께 고친다.
5. 상태 변형은 본문에 묻지 말고 `-hover` · `-active` · `-selected` · `-disabled` 항목으로 추가한다.
6. 고친 뒤 `npx -p @google/design.md designmd lint DESIGN.md`로 끊긴 참조·안 쓰는 토큰·대비를 검사한다. 오류 0건을 유지하고, 새 경고가 생기면 원인을 적는다.
   (Windows에서는 `npx @google/design.md lint`가 출력 없이 실패한다. 같은 패키지의 다른 실행 이름 `designmd`를 쓴다.)

## Known Gaps

- **결정은 반영했고 코드는 아직이다(2026-09-26 결정).**
  - 버튼 알약형: `ui/app-button`은 관리자 화면과 함께 쓰므로 고객용 크기(sm·md·lg)만 `rounded-full`로 바꾸고 관리자용(`console`·`xs`)은 그대로 둔다. 화면 안에서 직접 만든 사각 버튼 약 20곳(히어로·404·모달·빈 상태·예약 단계 확인·예약 상세·정렬 토글 등)도 바꿔야 한다. 이미 알약형인 버튼은 높이가 40·48·52·56·60px로 흩어져 있어 44·48px로 맞춘다.
  - 인증 블루: 코드는 아직 `#3B82F6`이다(로그인·회원가입 화면).
- **대비 경고(lint)**. 아래 토큰은 현재 화면값 그대로 두고 기록만 한다.
  - `status-cancelled` 4.13:1: 취소 배지 글자. `error`보다 한 단계 진한 글자색(예: `#b91c1c`)을 쓰면 해소된다.
  - `input-field-disabled` · `time-slot-disabled` 2.34:1: 비활성 요소는 WCAG 대비 기준의 예외라 의도된 값이다. 경고는 계속 남는다.
- **토큰과 코드가 아직 완전히 일치하지 않는다.** 하드코딩 hex(인증 화면·홈 행사 섹션·게시글 상세), `app-button` 밖에서 다시 정의한 버튼 약 10곳, 예약 흐름의 `slate` 보더 등이 남아 있다. 전체 목록은 [`docs/design-audit.md`](docs/design-audit.md) §12.
- **값이 두 곳에 있다.** 이 파일(규범)과 `globals.css`(구현). 이 파일에서 `@theme`을 생성하도록 바꾸는 것은 관리자 콘솔의 변수 덮어쓰기(`.admin-console`)와 충돌하지 않는지 확인한 뒤 결정한다.
- **보더 색·그림자·모션**은 규격의 컴포넌트 속성에 없어서 본문 설명으로만 적었다.
- **홈 행사·대회 섹션**(사진 패널·캐러셀·20px 카드)은 한 번만 쓰는 구성이라 토큰으로 만들지 않았다. 값은 audit §8.3.
- 다크 모드는 없다.
