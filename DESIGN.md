# DESIGN.md — 공공체육관 디자인 시스템

이 문서는 공공체육관 예약 서비스의 **디자인 단일 기준점(SSOT)**이다.
구현 토큰은 [`src/app/globals.css`](src/app/globals.css)의 `:root` / `@theme inline` 블록에 있고,
이 문서는 그 토큰의 **의미·사용 규칙·변경 방법**을 정의한다. 값이 바뀌면 두 곳을 같이 갱신한다.

## 1. 디자인 방향

**공공·의료 신뢰형.**
생활체육(전 연령, 특히 중장년 포함)을 위한 예약 서비스이므로 "깔끔하고 믿을 수 있는 공공 서비스" 인상을 최우선으로 한다.

핵심 원칙 4가지:

1. **무채 캔버스가 90%.** 흰색/아주 옅은 회색이 화면 대부분을 차지한다. 색으로 화면을 채우지 않는다.
2. **대표색은 단 하나(네이비), 점처럼 쓴다.** 버튼·로고·선택 상태·핵심 강조에만. 배경을 액센트 틴트로 도배하지 않는다. (이게 "AI 데모 느낌"을 만드는 가장 큰 원인이었다.)
3. **이모지 금지.** 아이콘은 전부 단색 라인 SVG로 직접 구현한다. 어떤 화면에서도 이모지를 쓰지 않는다.
4. **명확성 우선.** 상단 유틸 메뉴 등은 아이콘 only가 아니라 텍스트 라벨을 기본으로 한다(공공 톤 + 중장년 가독).

## 2. 색 (Color)

구현: `globals.css`의 `:root` + `@theme inline`. Tailwind 유틸로 `bg-accent`, `text-accent-strong`, `bg-surface`, `border-app` 등이 노출된다.
기존 `slate/sky/amber` 기본 팔레트는 **덮어쓰지 않는다**.

> **중립 회색은 `text-slate-*`(950/800/600/500 등) 직접 사용이 정상이다.** 토큰 미적용이 아니라 의도된 선택이며,
> 이를 `text-muted`/`text-foreground`로 일괄 치환할 필요는 없다(`src/components/AGENTS.md` § Tailwind 패턴과 동일 기준).
> 토큰화가 반드시 필요한 것은 **대표색·보더·상태색**이다: `bg-accent` / `border-line` / `text-error` 등.

### 중립 (캔버스)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--background` | `#F8FAFC` | 페이지 배경 |
| `--surface` | `#FFFFFF` | 카드·패널 |
| `--surface-2` | `#F1F5F9` | 옅은 채움(태그·아이콘 박스) |
| `--border-base` | `#E2E8F0` | 기본 보더 |
| `--border-strong` | `#CBD5E1` | 강한 보더·구분선 |
| `--foreground` | `#1F2937` | 본문 텍스트(순흑 아님) |
| `--muted` | `#475569` | 보조 텍스트 |
| `--subtle` | `#94A3B8` | 약한 텍스트·플레이스홀더 |

### 대표색 (네이비) — **색 변경 시 이 5줄만 교체**
| 토큰 | 값 | 용도 |
|---|---|---|
| `--accent` | `#2745B3` | 솔리드 배경 + 흰글씨 (버튼/선택 슬롯/티켓 헤더/로고) |
| `--accent-hover` | `#1E3690` | hover |
| `--accent-strong` | `#1E3A8A` | **흰 배경 위** 텍스트/아이콘/eyebrow |
| `--accent-tint` | `#EEF1FB` | 옅은 배경(선택·호버·배지) |
| `--accent-ink` | `#FFFFFF` | 솔리드 위 글씨 |

> **2톤 규칙.** 솔리드 위 흰글씨에는 `--accent`, 흰 배경 위 작은 텍스트/아이콘에는 진한 `--accent-strong`을 쓴다.
> 색을 밝은 계열(예: 민트)로 바꿀 때 이 분리를 지키지 않으면 흰글씨 대비가 깨진다.
> 흰글씨 솔리드 버튼은 대비 4.5:1(작은 글씨) / 3:1(큰 글씨)을 기준으로 검토한다.

### 상태색
| 토큰 | 값 | 용도 |
|---|---|---|
| `--success` | `#15803D` | 예약 가능·완료 |
| `--warning` | `#B45309` | 주의(취소 정책 등) |
| `--error` | `#DC2626` | 실패·마감 |

## 3. 타이포그래피

- **본문 폰트: Noto Sans KR** (`next/font/google`, weight 400/500/700/800, `--font-noto-sans-kr`).
  한국 공공·기관 사이트의 사실상 표준이라 신뢰형 방향에 맞다. `body`에서 Arial을 대체했다.
- `word-break: keep-all` — 한글을 어절 단위로 줄바꿈한다.
- `font-feature-settings: "tnum" 1` — 숫자 폭 정렬(시간·금액·잔여석). 표/금액/예약번호는 `tabular-nums`.
- 예약번호 등 식별자도 본문 폰트(Noto Sans KR) + tabular로 통일한다(별도 monospace로 분리하지 않는다).

### 실측 스케일 (as-built)

아래는 **구현된 화면에서 실제로 쓰는 값**이다. 새 화면은 추정하지 말고 이 표를 따른다.

| 역할 | 값 | 사용처 |
|---|---|---|
| 페이지 h1 | `text-[28px]` → `sm:text-[32px]`, bold | 공지·마이페이지·시설찾기 등 모든 페이지 제목 |
| 게시판 섹션 h2 | `text-[34px]` bold | 문의 게시판 "문의 게시판" |
| 탭 라벨 | `text-[18px]` → `sm:text-[22px]` | 마이페이지·FAQ 탭 |
| 표 헤더 | `text-[18px]` bold | 게시판 `thead` |
| 표 셀 | `text-[16px]`~`text-[18px]` | 게시판 `td` |
| 본문·부제·설명 | `text-[15px]` | 페이지 부제, 드롭다운 옵션 |
| 폼 필드 라벨 | `text-[12.5px]` bold | 시설찾기 필터 라벨 |
| 보조·breadcrumb | `text-[13px]` | breadcrumb, 힌트 |

위계만 지키면 되는 게 아니라 **이 값 자체가 기준**이다. 히어로(홈)만 예외적으로 더 큰 값을 쓴다.

## 4. 모양 · 레이아웃 · 모션

| 토큰 | 값 | 비고 |
|---|---|---|
| `--r-sm` | `6px` | 태그·작은 요소 |
| `--r` | `8px` | 버튼·인풋·슬롯 |
| `--r-lg` | `12px` | 카드·패널 |
| `--container-max` | `1440px` | 본문 최대 폭(양옆 여백 과다 방지) |
| `--container-pad` | `32px` | 좌우 패딩 |

- 전환: `0.25s ease` 기준의 차분한 모션.

### 실측 radius (as-built)

CSS 변수 `--r*`는 남아 있지만, 화면은 실제로 **Tailwind 유틸 값**을 쓴다. 요소별로 아래를 따른다.

| 요소 | 실제 값 | 클래스 |
|---|---|---|
| 버튼(기본) | 8px | `rounded-lg` (`app-button` SSOT) |
| 토글 버튼(정렬·필터) | 6px | `rounded-md` |
| 폼 컨트롤(input·select) | 10px | `rounded-[10px]` |
| 드롭다운 목록·페이지네이션 | 8px | `rounded-lg` |
| 카드(시설·퀵액션·빈 상태) | 12px | `rounded-xl` |
| 패널(필터·검색 박스) | 16px | `rounded-2xl` |
| 검색바 | 알약 | `rounded-full` + `border-2` |
| 게시판 액션 버튼(글쓰기) | 알약 | `rounded-[30px]` |
| 배지 | 알약 | `rounded-full` / `rounded-[25px]` |

> 페이지 컨테이너는 `mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-8 sm:py-10`이 표준이다.

### 그림자 (as-built)

**그림자는 카드에만 쓴다. 패널·표·컨트롤에는 쓰지 않는다.**

| 요소 | 값 |
|---|---|
| 카드(기본) | `shadow-[0_1px_3px_rgba(15,23,42,0.06)]` |
| 카드(hover) | `shadow-[0_4px_16px_rgba(15,23,42,0.09)]` |
| 드롭다운 팝오버 | `shadow-[0_8px_24px_rgba(15,23,42,0.12)]` |

## 5. 컴포넌트 패턴

- **헤더**: 흰 배경 + 로고 + 가로 메인 내비(메가메뉴) + 우측 유틸(텍스트 + 세로 구분선: `마이페이지 | 회원가입 | KR`). 상단 다크 유틸바는 두지 않는다.
- **내비 hover**: 메뉴 글자 밑 짧은 액센트 밑줄 하나만. 메가메뉴 상단의 긴 라인은 쓰지 않는다.
- **히어로**: 실사진(그레이스케일 + 네이비 베일로 텍스트 가독 확보) + 헤드라인/서브카피. 히어로 안에 큰 CTA 버튼을 넣지 않고, 아래 퀵액션 카드가 행동을 유도한다.
- **퀵액션 카드**: 라인아이콘 + 제목 + 한 줄 설명. hover 시 **배경을 `--accent`로, 글자·아이콘을 흰색으로** 전환.
- **시설 카드**: 썸네일 + 상태 배지 + 이름 + 위치 + 종목 태그 + 가격 + `예약하기` 버튼(좌우 넉넉한 패딩). 가격은 `12,000 원 / 2시간`처럼 숫자와 단위를 한 칸 띄운다.
- **시간대 슬롯**: 잔여(흰 배경+보더) / 선택됨(`--accent` 채움+흰글씨) / 마감(`--surface-2`, 흐린 텍스트, **취소선 없음**).
- **예약 티켓**: `--accent` 헤더(흰글씨) + 정보 행(tabular) + 예약번호. 2열 레이아웃에서 우측 컬럼을 꽉 채워 옆 여백이 비지 않게 한다.
- **배지**: 예약완료(accent-tint) / 이용완료(surface-2) / 취소됨(error). 작은 led 점 + 라벨.
- **알림(alert)**: 좌측 컬러 보더(accent/warning/error) + 흰 배경.

### 재사용 프리미티브 (SSOT — 새로 만들지 말고 이걸 쓴다)

`src/components/ui/`에 구현돼 있다. 같은 룩을 인라인으로 다시 만들지 않는다.

| 컴포넌트 | 규격 |
|---|---|
| `app-button` (`Button`/`ButtonLink`) | base `rounded-lg font-bold` + `focus-visible:ring-2 ring-accent ring-offset-2` + `disabled:opacity-60`. variant: primary `bg-accent text-accent-ink hover:bg-accent-hover` / outline `border-line-strong bg-white hover:border-accent hover:text-accent-strong` / ghost `text-muted hover:bg-surface-2` / danger `bg-error text-white` / danger-outline `border-error/30 text-error`. size(고객): sm `h-9 px-[14px] 14.5px` · md `h-11 px-[19px] 15.5px` · lg `h-12 px-7 16.5px`. size(관리자 콘솔): console `h-9 px-3.5 13px` · xs `h-7 rounded-md px-2.5 12px` |
| `select-menu` | 네이티브 `<select>` 금지. chevron + 목록 `rounded-lg border-line bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]`, 옵션 `px-4 py-2.5 text-[15px]`, 선택 `font-semibold text-accent-strong` |
| `board-pagination` | `size-10 rounded-lg border-line`, 활성 `bg-accent text-white`. 여백은 `spacing`: board(기본) `mt-20 mb-14` / compact(콘솔) `py-3` |
| `search-bar` | 알약 `rounded-full border-2`. default: `h-[60px] border-foreground` + 원형 accent 버튼 `size-10`. board(공지·FAQ·문의): `h-[68px] border-black` + 원형 black 버튼 `size-12` |

### 페이지 셸

- 컨테이너 `mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-8 sm:py-10`
- breadcrumb `text-[13px] text-muted` (구분자 `text-line-strong`, 현재 위치 `font-semibold text-foreground`)
- h1 → 부제(`mt-2 text-[15px] leading-relaxed text-muted`)

### 탭 내비

`grid` 등분, 각 탭 `-mb-px border-b-2 py-4 text-center`.
활성 `border-accent font-bold text-accent-strong` / 비활성 `border-transparent font-medium text-muted hover:text-foreground`.

### 필터 패널 · 폼 컨트롤

- 패널 `rounded-2xl border border-line bg-white p-5 sm:p-6` — **그림자 없음**(그림자는 카드에만 쓴다).
- 컨트롤 `h-12 rounded-[10px] border border-line-strong bg-white px-3.5 text-[15px]`
  + `focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20` + `disabled:cursor-not-allowed disabled:bg-surface-2`
- 필드 라벨 `text-[12.5px] font-bold text-foreground`, 필드 래퍼 `flex flex-col gap-1.5`
- 토글 버튼(정렬·필터) `h-10 rounded-md border px-3 text-sm font-semibold`,
  활성 `border-accent bg-accent-tint text-accent-strong` / 비활성 `border-line-strong bg-white text-muted`

### 게시판 표 (목록형 화면의 표준)

- 표 상단 굵은 선 `border-t-2 border-foreground/80`
- `thead` `bg-surface-2 border-b border-line text-[18px] font-bold text-foreground`, `th` 높이 `h-[72px]`
- 셀 세로 구분 `border-l border-line`, 행 `border-b border-line hover:bg-surface-2`
- 숫자·날짜는 `tabular-nums text-muted`
- 빈 상태(표 안) `h-[120px] text-center text-[16px] text-muted`
- 빈 상태(카드) `rounded-xl border border-dashed border-line-strong bg-white p-10 text-center`

### 상태 배지

`reservation/reservation-ticket.tsx`의 `reservationStatusBadgeStyles`가 SSOT다.
예약중 `bg-accent-tint text-accent-strong` / 취소 `bg-error/10 text-error` / 이용완료 `bg-surface-2 text-muted`.

### 관리자 콘솔 (별도 디자인 언어)

**관리자 콘솔은 위 §5의 고객 화면 패턴을 따르지 않는다.** 고객 화면은 *읽는* 화면(넓은 여백·큰 타이포·게시판 표)이고,
콘솔은 *조작하는* 화면이다. 같은 규격을 쓰면 한 화면에 절반밖에 안 들어오고, 관리자가 고객 페이지에 있는 것처럼 느낀다.

**공유하는 것 (고객 화면에서 그대로 가져옴)**
- `globals.css` 색 토큰 전부 — 브랜드 네이비 `--accent`, 상태색, 중립
- `Noto Sans KR`, `tabular-nums`
- `ui/app-button`, `ui/select-menu`, `ui/board-pagination` (크기만 콘솔 사이즈로)
- 예약 상태 배지 의미(§ 상태 배지)

**다른 것 (콘솔 고유)**

| 항목 | 고객 화면 | 관리자 콘솔 |
|---|---|---|
| 셸 | GNB + 푸터 + `max-w-[1440px]` 중앙정렬 | **전역 chrome 없음**(`site-chrome`의 `BARE_PREFIXES`) + 좌측 고정 사이드바 `w-57` + 상단바 `h-14` + 캔버스 `bg-surface-2`, 본문 전체 폭 |
| 페이지 제목 | h1 `28→32px` | 상단바 h1 `17px` |
| 본문 | `15px` | `13.5px` |
| 패널 | `rounded-2xl` `p-5 sm:p-6`, 제목 `19px` | `rounded-xl` `p-4 sm:p-5`, 제목 `15px` |
| 표 | 굵은 상단선 + 세로 구분선, 헤더 `18px/h-[72px]` | 카드 안 데이터 표(세로 구분선 없음), 헤더 `12px/h-[42px]` · 셀 `13.5px/h-12` |
| 컨트롤 | `h-12` `rounded-[10px]` `15px` | `h-9` `rounded-lg` `13px` |
| 필드 라벨 | `12.5px` | `11.5px` |
| 버튼 | `md`(h-11) / `lg`(h-12) | `console`(h-9, 기본) / `xs`(h-7, 표 안 인라인 액션) |
| 사이드바 활성 메뉴 | — | `bg-accent text-accent-ink`(솔리드). 토글·필터의 선택(`accent-tint`)과 위계를 구분한다 |

**SSOT 파일**

| 파일 | 역할 |
|---|---|
| `admin/admin-ui.tsx` | 패널·표·컨트롤·토글의 규격. 화면마다 다시 정의하지 않는다 |
| `admin/admin-nav-items.ts` | 메뉴(그룹·아이콘 키). 사이드바가 이 배열만 본다 |
| `admin/admin-nav-icons.tsx` | 메뉴 아이콘 SVG |
| `admin/admin-shell.tsx` | 사이드바 + 상단바 + 캔버스. 각 화면은 **본문만** 렌더한다 |
| `admin/admin-auth-gate.tsx` | Basic Auth 다음 단계인 Firebase 로그인 + `admin` 클레임 게이트 |

**대시보드 원칙**: 표시하는 숫자는 서버가 실제로 주는 값만 쓴다.
목표 대비 달성률·전일 대비 증감처럼 근거 API가 없는 지표는 **넣지 않는다**(추정치를 실측처럼 보이게 하지 않는다).

## 6. 변경 방법 (유연성)

이 프로젝트는 마무리까지 디자인·버튼 크기·기능이 계속 바뀐다. 그래서 **토큰만 바꾸면 전체가 따라오도록** 설계했다.

- **대표색 교체**: `globals.css`의 `--accent*` 5줄만 수정. (네이비 → 민트/그린/슬레이트 등) 단 §2 "2톤 규칙"과 대비 기준을 확인한다.
- **모서리/여백**: `--r*`, `--container-*` 수정.
- **폰트 교체**: `layout.tsx`의 `Noto_Sans_KR` 교체 + `globals.css`의 `--font-noto-sans-kr` 참조 갱신.
- 컴포넌트는 하드코딩 색 대신 위 토큰(또는 노출된 `bg-accent` 등 유틸)을 사용한다. 새 색/모양을 컴포넌트에 직접 박지 않는다(SSOT 분산 금지).

## 7. 적용 현황

- [x] 토대: `globals.css` 토큰 + `layout.tsx` 폰트(Noto Sans KR) — **완료**
- [x] 고객 화면(홈 / 시설 목록·상세 / 예약 흐름 / 마이페이지 / 공지·FAQ·문의 / 헤더·푸터) — **완료**
- [x] 관리자 콘솔(대시보드 + 9화면) — **완료**. 백오피스 셸(사이드바·상단바·캔버스) + 콘솔 밀도 프리미티브
- [ ] 히어로 실사진 에셋(통제 가능한 위치에 호스팅) — 추후

> 관리자 콘솔은 고객 화면의 "축소판"이 아니라 **별도 디자인 언어**다(§5 관리자 콘솔). 색·폰트 토큰만 공유한다.
> i18n은 관리자 콘솔에 적용하지 않는다(운영자 전용, 국문 고정 — 의도된 범위 제외).
> 다만 **다국어(i18n)는 관리자 범위 밖**이라 국문 하드코딩을 유지한다.

> 시각 기준 시안: `design-preview-gym-v6.html`(작업 디렉터리 외부, Downloads). 정적 시안이며 실제 데이터·라우팅은 없다.
