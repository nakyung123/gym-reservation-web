# 디자인 실측 기록 (Design Audit)

이 문서는 [`DESIGN.md`](../DESIGN.md)(고객·인증)와 [`DESIGN-admin.md`](../DESIGN-admin.md)(관리자)의 디자인 시스템이 **현재 코드와 화면에 실제로 어떻게 구현돼 있는지** 기록한 실측 자료다.
DESIGN.md가 "무엇을 써야 하는가"(규범·토큰)라면, 이 문서는 "지금 무엇이 쓰여 있는가"(현황)다.
새 화면은 DESIGN.md를 따르고, 이 문서는 드리프트 정리(§12)와 검증 기준으로 쓴다.

> **실측 기준** — 2026-09-26, 배포본(main `946d940`) 기준.
> 데스크톱 1440×900 / 모바일 390×844 뷰포트에서 브라우저 계산값(computed style)을 측정하고, 컴포넌트 코드의 클래스와 대조했다.
> 아래 px 값은 "이렇게 하자"가 아니라 **지금 화면이 실제로 이렇게 되어 있다**는 기록이다. 새 화면의 기준은 DESIGN.md 토큰이다.

---

## 0. 한눈에 보기

이 서비스에는 **디자인 언어가 3개** 있다. 화면을 만들 때 먼저 어느 쪽인지 정하고 그 규격을 따른다.

| | 고객 화면 | 인증 화면 | 관리자 콘솔 |
|---|---|---|---|
| 범위 | 홈·시설·예약·마이페이지·공지·FAQ·이용안내 | `/login` `/signup` `/reset-password` `/auth/action` | `/admin/*` |
| 인상 | 공공기관 포털, 신뢰형, 넓은 여백·큰 글자 | 모바일 앱형 단일 컬럼, 무채색 | SaaS 대시보드, 플랫, 고밀도 |
| 폰트 | Noto Sans KR | Noto Sans KR | Pretendard |
| 대표색 | 네이비 `#2745B3` | 검정 `#121212` + 블루 `#3B82F6` | 퍼플 `#5F43FF` |
| 캔버스 | `#F8FAFC` + 흰 카드 | 흰색 단색 | `#F7F7F9` + 흰 카드 |
| 폭 | `max-w-[1440px]` 중앙 정렬 | `max-w-[520px]` 중앙 컬럼 | 사이드바 256px + 본문 전체 폭 |
| 모서리 | 8~16px 중심, CTA는 알약형 혼용 | 3px | 12px 통일 |
| 전역 크롬 | GNB + 네이비 푸터 + 챗 위젯 | 없음(자체 헤더) | 없음(사이드바 셸) |

전역 크롬을 숨기는 라우트는 [`site-chrome.tsx`](../src/components/layout/site-chrome.tsx)의 `BARE_PREFIXES`가 결정한다.

---

## 1. 컨셉과 원칙 (고객 화면)

**공공·생활체육 신뢰형.** 전 연령(특히 중장년)이 쓰는 공공 예약 서비스라, "깔끔하고 믿을 수 있는 공공 서비스" 인상을 최우선으로 한다.
딱딱함은 사진·일러스트로 덜어낸다(히어로 일러스트, 시설 실사진, 행사 사진, 마스코트).

1. **무채 캔버스 + 대표색 하나.** 배경은 `#F8FAFC`, 카드는 흰색. 네이비는 버튼·로고·선택 상태·제목 강조에만 쓴다. 배경을 네이비 틴트로 도배하지 않는다(예외: 주요공지 행, FAQ 답변, 선택된 항목처럼 "선택/강조" 의미가 있을 때만 `accent-tint`).
2. **이모지 금지.** 아이콘은 단색 라인 SVG로 직접 그린다. 예외는 홈 예약 흐름의 듀오톤 아이콘(§7)뿐이다.
3. **텍스트 라벨 우선.** 상단 유틸은 아이콘이 아니라 `로그인 | 회원가입 | KR`처럼 글자와 세로 구분선으로 둔다.
4. **큰 글자.** 본문 기본값이 16.5px, 게시판 표가 18px, 탭이 22px이다. 작게 줄이지 않는다.
5. **공공기관 게시판 문법.** 목록형 화면(공지·문의·마이페이지)은 굵은 상단선 + 회색 헤더 + 세로 구분선의 게시판 표로 통일한다.
6. **그림자는 떠 있는 것에만.** 카드·팝오버·모달·플로팅 버튼에만 쓰고, 패널·표·입력칸에는 쓰지 않는다.

---

## 2. 색 (Color)

### 2.1 고객 화면 토큰 — `globals.css :root`

Tailwind 유틸로 노출된 이름(`bg-accent`, `border-line` 등)을 함께 적는다.

**중립**

| 토큰 | 값 | 유틸 | 실제 용도 |
|---|---|---|---|
| `--background` | `#F8FAFC` | `bg-background` | 페이지 배경(body) |
| `--surface` | `#FFFFFF` | `bg-surface` | 헤더·카드·패널 |
| `--surface-2` | `#F1F5F9` | `bg-surface-2` | 표 헤더, 태그, hover 행, 비활성 슬롯, 회원정보 폼 박스 |
| `--border-base` | `#E2E8F0` | `border-line` | 카드·표·구분선 기본 보더 |
| `--border-strong` | `#CBD5E1` | `border-line-strong` | 입력칸·드롭다운·토글 버튼 보더, breadcrumb 구분자 |
| `--foreground` | `#1F2937` | `text-foreground` | 본문, 페이지 h1, 표 텍스트 |
| `--muted` | `#475569` | `text-muted` | 부제·설명·주소·비활성 탭 |
| `--subtle` | `#94A3B8` | `text-subtle` | 플레이스홀더, 가격 단위, 아이콘 보조색 |

**대표색(네이비)** — 색을 바꾸려면 이 5줄만 교체한다

| 토큰 | 값 | 유틸 | 실제 용도 |
|---|---|---|---|
| `--accent` | `#2745B3` | `bg-accent` | 솔리드 버튼, 활성 페이지 번호, 선택 슬롯/날짜, 탭 밑줄, GNB hover 밑줄, 챗 위젯 테두리 |
| `--accent-hover` | `#1E3690` | `bg-accent-hover` | 솔리드 버튼 hover |
| `--accent-strong` | `#1E3A8A` | `text-accent-strong` | 흰 배경 위 네이비 글자: 히어로 제목, 활성 탭, eyebrow, 링크 hover |
| `--accent-tint` | `#EEF1FB` | `bg-accent-tint` | 선택/강조 배경: 주요공지 행, FAQ 답변, 선택된 종목, 합계 바, 활성 토글 |
| `--accent-ink` | `#FFFFFF` | `text-accent-ink` | 솔리드 위 글자 |

> **2톤 규칙.** 솔리드 배경 + 흰 글씨는 `--accent`, 흰 배경 위 작은 글자·아이콘은 더 진한 `--accent-strong`.
> 밝은 색으로 바꿀 때 이 분리를 지키지 않으면 흰 글씨 대비가 깨진다. 흰 글씨 솔리드는 4.5:1(작은 글씨) / 3:1(큰 글씨) 이상을 확인한다.

**상태색**

| 토큰 | 값 | 유틸 | 실제 용도 |
|---|---|---|---|
| `--success` | `#15803D` | `text-success` | "예약 가능" 배지·점, 성공 안내 |
| `--warning` | `#B45309` | `text-warning` | 시간 선택 경고, 관리자 주의 박스 |
| `--error` | `#DC2626` | `text-error` | 실패 메시지, 필수 표시(*), 일요일 날짜, 취소 배지 |

상태색 배경은 `/10`, 보더는 `/30` 틴트로 쓴다: 예) 오류 박스 `border-error/30 bg-error/10 text-error`.

### 2.2 중립 텍스트는 `slate-*` 직접 사용

토큰 미적용이 아니라 의도된 선택이다. 제목급은 토큰보다 진한 `slate-950`을 쓴다.
값은 Tailwind v4 기본 팔레트(oklch)를 hex로 옮긴 근삿값이다.

| 클래스 | 값(≈) | 주 용도 |
|---|---|---|
| `text-slate-950` | `#020618` | 홈 섹션 h2, 카드 제목, 가격 숫자, 이용안내 제목 |
| `text-slate-900` | `#0F172B` | 예약 흐름 섹션 제목, 알림 모달, 푸터 배경(`bg-slate-900`) |
| `text-slate-800` / `700` | `#1D293D` / `#314158` | 폼 라벨, 예약 폼 본문 |
| `text-slate-600` / `500` | `#45556C` / `#62748E` | 보조 설명(예약 흐름·히어로 부제) |
| `text-slate-400` | `#90A1B9` | 푸터 링크 |

### 2.3 예약 상태 표현 — SSOT

[`reservation/reservation-ticket.tsx`](../src/components/reservation/reservation-ticket.tsx)의 `reservationStatusBadgeStyles`가 기준이다.

| 상태 | 배지 | 비고 |
|---|---|---|
| 예약 완료 | `bg-accent-tint text-accent-strong` | |
| 예약 취소 | `bg-error/10 text-error` | |
| 이용 완료 | `bg-surface-2 text-muted` | |

- 관리자 표는 같은 색 의미에 보더가 있는 알약형(`h-6 rounded-full border px-2 text-[11.5px] font-bold`)을 쓴다.
- 마이페이지 예약내역 표의 상태 칸은 현재 **배지 없이 평문**(`text-foreground`)으로 표시된다.

### 2.4 토큰 밖의 고정 색 (현재 상태 기록)

아래는 컴포넌트에 hex로 직접 박혀 있어 `--accent*`를 바꿔도 **따라오지 않는** 색이다. 새 화면에 퍼뜨리지 않는다. 정리 후보는 §12.

| 영역 | 값 | 용도 |
|---|---|---|
| 브랜드 로고 | `#2745B3` | [`brand-logo.tsx`](../src/components/ui/brand-logo.tsx) 워드마크(토큰과 같은 값이지만 하드코딩) |
| 홈 히어로 | `#F4EFE8` | 크림 배경 + 좌→우 크림 베일 그라데이션 |
| 홈 예약 흐름 아이콘 | `#BCC8F2` / `#2745B3` / `#1E3A8A` | 듀오톤 아이콘 베이스/딥/배지 |
| 홈 행사·대회 | `#1D1D1D` `#555555` `#D3E1FB` `#D8D8D8` `#F8F8F8` `#15235C/40` `#9DB4FF` | 카드 제목·날짜·카테고리 배지·컨트롤 보더·화살표 원·사진 오버레이·제목 강조 |
| 게시글 상세(공지·문의) | `#1D1D1D` `#555555` `#8E8E8E` | 제목·본문, 메타, 비활성 이전/다음 |
| 문의 안내 박스 | `#EEF3FC` | 문의 탭 상단 안내 영역 |
| 시설 상세 | `#E8EEFB` / `#F5B50A` | 이미지 자리 배경 / 즐겨찾기 별(채움) |
| 시설 카드 즐겨찾기 | `amber-400` | 별 아이콘(켜짐) |
| 예약 완료 | `#27AE60` | 완료 체크 원 |
| 푸터 | `slate-900` 배경, `#1E293B` 구분선, `#64748B` 저작권 | 네이비 계열 다크 푸터 |
| 로딩 스피너 | `#E23B3B` + `--accent` | 빨강·네이비 두 원 교차 |
| 인증 화면 전체 | §9 참고 | 별도 무채 팔레트 |
| 소셜 로그인 | 카카오 `#FEE500`, 네이버 `#03C75A`, 페이스북 `#1877F2`, 구글 흰 원 + `#E3E3E3` 보더 | 브랜드 가이드 색(의도적 예외) |

### 2.5 관리자 콘솔 팔레트 — `globals.css .admin-console`

`app/admin/layout.tsx`가 `.admin-console`로 감싸고, 이 스코프 안에서 **같은 변수 이름을 덮어쓴다**. 그래서 관리자 코드는 `bg-accent`를 그대로 써도 퍼플이 된다.

| 토큰 | 고객 | 관리자 |
|---|---|---|
| `--background` | `#F8FAFC` | `#F7F7F9` |
| `--foreground` | `#1F2937` | `#111111` |
| `--surface-2` | `#F1F5F9` | `#F3F3F7` |
| `--border-base` | `#E2E8F0` | `#ECECF1` (하이라인) |
| `--border-strong` | `#CBD5E1` | `#E2E2EA` |
| `--muted` | `#475569` | `#505050` |
| `--subtle` | `#94A3B8` | `#767676` |
| `--success` / `--error` | `#15803D` / `#DC2626` | `#0C8800` / `#C42A2A` |
| `--accent` / `--accent-hover` | `#2745B3` / `#1E3690` | `#5F43FF` / `#4A2FD6` |
| `--accent-strong` | `#1E3A8A` | `#5F43FF` |
| `--accent-tint` | `#EEF1FB` | `#EBEAFC` (라벤더) |

차트 색은 [`admin-charts.tsx`](../src/components/admin/admin-charts.tsx)에 고정돼 있다: 예약 `#5F43FF`, 이용 완료 `#10B981`, 취소 `#F43F5E`, 보조선 `#767676`, 그리드 `#ECECF1`.

---

## 3. 타이포그래피

### 3.1 폰트

| 폰트 | 로딩 | 범위 |
|---|---|---|
| **Noto Sans KR** | `next/font/google`, weight 400/500/700/800, `display: swap`, preload 끔 | 고객 화면 + 인증 화면 (`--font-sans`, `--font-mono` 모두 이 폰트) |
| **Pretendard Std Variable** | `next/font/local`, `src/app/fonts/PretendardStdVariable.woff2` 1개(약 292KB), weight 400~800 | 관리자 콘솔만 |

- Pretendard Std는 KS X 1001(한글 2,350자) 서브셋이라 그 밖의 희귀 음절은 시스템 폰트로 대체된다. 전체 커버가 필요하면 풀 Variable(약 2MB)로 파일만 교체한다.
- 예약번호·금액·시간도 별도 monospace 없이 본문 폰트 + `tabular-nums`로 정렬한다. 관리자는 `.admin-num` 클래스.

### 3.2 body 기본값 (`globals.css`)

`font-size: 16.5px` · `line-height: 1.6`(26.4px) · `color: #1F2937` · `word-break: keep-all` · `font-feature-settings: "tnum" 1` · antialiased.
임의 크기(`text-[18px]` 등)는 줄간격을 따로 주지 않으면 이 1.6을 상속한다. 이 값이 빠지면 화면 전체가 세로로 줄어든다.

### 3.3 실측 스케일 — 고객 화면

크기는 `모바일 → sm 이상` 순서. 굵기는 400 regular / 500 medium / 600 semibold / 700 bold / 800 extrabold.

**제목**

| 역할 | 크기 / 굵기 / 기타 | 사용처 |
|---|---|---|
| 홈 히어로 h1 | 34 → **46px** / 800 / lh 1.26 / -0.025em / `accent-strong` | 홈 |
| 소개형 h1 | 28 → 34px (이용안내), 30 → 40px (사업소개) / 800 / -0.02em / `slate-950` | `/guide` `/about` |
| 게시글 상세 h1 | 26 → 36px / 700 / `#1D1D1D` | 공지·문의 상세 |
| 예약 완료 h1 | 36px / 700 | 예약 완료 화면 |
| **페이지 h1 (표준)** | 28 → **32px** / 700 / `foreground` | 시설 찾기·상세·공지·FAQ·마이페이지·예약 상세 |
| 게시판 섹션 h2 | 34px / 700 | "문의 게시판" |
| 행사 섹션 h2 | 27 → 34px / 600 / lh 1.35 / 흰색 | 홈 행사·대회 |
| 홈 섹션 h2 | 31px / 800 / -0.02em / `slate-950` | "이렇게 이용하세요", "가까운 체육시설" |
| 이용안내 단계 h2 | 26 → 30px / 800 / lh 1.3 | `/guide` 단계 제목 |
| 예약 흐름 섹션 제목 | 20px / 700 / `slate-900` | 접이식 섹션, 예약 흐름 상단 체육관명 |
| 예약 요약 박스 제목 | 24px / 700 | "나의 예약 정보", "결제 금액" |
| 404 h1 | 26 → 32px / 800 / -0.02em | `not-found` |

**eyebrow (영문 대문자 라벨)**: 13 ~ 13.5px / 700 / `+0.06 ~ 0.08em` / `accent-strong`. 예) `GUIDE`, `FACILITIES`. 이용안내 단계 번호는 18px / 700 / 0.06em.

**본문·컴포넌트**

| 역할 | 값 | 사용처 |
|---|---|---|
| 탭 라벨 | 18 → **22px**, 활성 700 / 비활성 500 | 마이페이지·FAQ·시설 상세 탭 |
| FAQ 질문 | 18 → 22px / 500 | FAQ 아코디언 |
| 행사 카드 제목 | 22px / 600 / lh 33px / `#1D1D1D` | 홈 행사 |
| 가격 숫자 | 21px / 800 / tabular + `원` 15px/700 + 단위 13.5px/500 `subtle` | 시설 카드 `2,400 원 / 2시간` |
| 시설 카드 제목 | 19.5px / 700 / `slate-950` | 홈·시설 찾기 카드 |
| 시설 상세 정보 | 라벨 19px/700, 값 19px/400 `muted` | 상세 상단 정보표 |
| 예약 흐름 카드 제목 | 18.5px / 700 | 홈 "이렇게 이용하세요" 카드 |
| 게시판 표 헤더 | 18px / 700(문의) · 600(마이페이지) | 게시판 `thead` |
| 게시판 표 셀 / 공지 제목 | 18px (공지 제목 500, 모바일 16px) | 게시판 `td` |
| GNB 메뉴 | 17px / 700 | 헤더 |
| 상세 섹션 라벨 | 17px / 700, 값 16px `muted` | 시설 상세 탭 본문 |
| 홈 섹션 부제 | 16.5px / `muted` | 홈 |
| 게시판 날짜·작성자, FAQ 답변 | 16px | |
| 예약 폼 본문 | 16px | 종목·인원·예약자 정보 |
| 버튼(md) | 15.5px / 700 | `app-button` md |
| **페이지 부제 / 본문 설명** | **15px** / `muted` / `leading-relaxed` | 모든 페이지 h1 아래 |
| 드롭다운 옵션·입력칸 | 15px | `select-menu`, 필터 컨트롤 |
| 헤더 유틸·푸터 링크 | 14.5px / 600(유틸) | 헤더 우측, 푸터 |
| 주소 | 14.5px / `muted` | 시설 카드 |
| 표 안 알약 버튼, 정렬 토글, 페이지 번호 | 14px / 600 | |
| breadcrumb | 13px / `muted`, 현재 위치 600 `foreground` | 모든 페이지 상단 |
| 종목 태그 | 13px / 600 / `muted` | 카드 |
| 필드 라벨 | 12.5px / 700 | 필터·검색 라벨 |
| 상태 배지 | 12.5px / 700 | "예약 가능" |

**굵기 사용 빈도**(코드 기준): bold 146 · semibold 135 · medium 54 · extrabold 18 · normal 1.
extrabold(800)는 홈·소개형 제목, 가격 숫자, 푸터 전화번호, 로고에만 쓴다.

**자간**: 큰 제목 `-0.02em`(히어로 `-0.025em`), 영문 eyebrow `+0.06 ~ 0.08em`. 본문은 기본값.

---

## 4. 레이아웃 · 간격

### 4.1 컨테이너와 페이지 셸

- **공통 컨테이너**: `mx-auto w-full max-w-[1440px] px-5 sm:px-8` → 1440px 화면에서 본문 폭 1376px.
- **표준 페이지 셸** (시설 찾기·상세·공지·FAQ·이용안내·사업소개):
  `main.max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12` →
  breadcrumb(`text-[13px]`, 구분자 `/` `text-line-strong`) → `mt-4` h1 → `mt-2` 부제(15px) → `mt-8 ~ mt-9` 본문.
  마이페이지만 `py-9 sm:py-10`, h1 `mt-3`.
- **좁은 컬럼**(화면 성격상 폭을 줄이는 곳)

| 화면 | 폭 |
|---|---|
| 예약하기 / 예약 상세 | `w-[1200px]` (좌측 본문 flex-1 + 우측 요약 `378px` sticky `top-24`) |
| 예약 달력 | `max-w-[752px]` |
| 회원정보 변경 폼 | `w-[800px]` |
| 게시판 검색바 | `max-w-[646px]` (기본형 680px) |
| 문의 게시판 / 안내 박스 | `max-w-[1400px]` |
| 인증 화면 | `max-w-[520px]` (내용 480px) |

### 4.2 헤더

- 높이 **76px**(+ 하단 보더 1px). 로고 24px, 로고↔메뉴 간격 `gap-11`(44px), 메뉴 좌우 패딩 20px.
- 일반 라우트: `sticky top-0` 흰 배경 + `border-line`.
- **홈**: `fixed` 투명으로 시작(글자 `slate-500`, 보더 0.5px `slate-300`) → 스크롤 10px 이상 또는 헤더 hover 시 `bg-surface/95 backdrop-blur-sm` 솔리드로 300ms 전환.
- 우측 유틸: 비로그인 `로그인 | 회원가입 | KR`, 로그인 `마이페이지 | 로그아웃 | KR`. 구분선 13px 높이 1px `line-strong`.

### 4.3 섹션 간격 (실측)

| 위치 | 값 |
|---|---|
| 홈 섹션 상하 | `py-[72px]`, 섹션 헤더 아래 `mb-[30px]` |
| 홈 행사 섹션 | `xl:py-[90px]`, 높이 750px |
| 게시판: 부제 → 검색바 → 표 | 각각 `mt-[60px]` |
| 탭 → 본문(마이페이지) | `mt-[72px]` |
| 페이지네이션(게시판) | `mt-20 mb-14` (80 / 56px) |
| 카드 그리드 | 시설 `gap-6`(24px), 예약 흐름 `gap-5`(20px), 행사 캐러셀 20px |
| 푸터 | `mt-6`, 안쪽 `pt-[44px] pb-[30px]` |

### 4.4 반응형

- 브레이크포인트: `sm` 640px(패딩·글자 확대), `lg` 1024px(GNB ↔ 햄버거, 다열 그리드), `xl` 1280px(홈 행사 섹션 2단).
- 시설 카드 1 → 2 → 3열, 예약 흐름 카드 1 → 2 → 4열, 필터 패널 1 → 2 → `[1fr_1fr_1.3fr_auto]`.
- 모바일(390px 실측): 좌우 여백 20px, 필터가 세로로 쌓이고 검색 버튼은 전체 폭, 헤더는 로고 + 44px 햄버거.
- 모바일 드로어: 헤더 아래 전체 폭, 메뉴 행 `min-h-[44px]`(터치 타깃), 하단에 로그인/회원가입 버튼 2개.
- 탭 하단 1px 선은 `w-screen` full-bleed로 화면 끝까지 그린다(`left-[calc(50%_-_50vw)]`).

---

## 5. 모양 · 보더 · 그림자

### 5.1 모서리 (radius) — 실측

`--r-sm / --r / --r-lg` 변수는 정의만 있고 **컴포넌트에서 쓰이지 않는다.** 실제 화면은 Tailwind 유틸 값을 쓴다.

| 값 | 클래스 | 요소 |
|---|---|---|
| 3px | `rounded-[3px]` | 인증 화면 입력칸·버튼 |
| 6px | `rounded-md` | 종목 태그, 정렬 토글, 시간 슬롯, 달력 날짜, 인원 ± 버튼, 예약 상세 액션 버튼, 회원정보 입력칸 |
| **8px** | `rounded-lg` | **기본 버튼(`app-button`)**, 드롭다운 목록, 페이지네이션, 예약 합계 바 |
| 10px | `rounded-[10px]` | 필터·검색 컨트롤(h-12), 히어로·404 CTA |
| **12px** | `rounded-xl` | **카드**(시설·예약 흐름·빈 상태), 종목 선택 항목, 메가메뉴 하단 |
| **16px** | `rounded-2xl` | **패널**(필터), 예약 접이식 섹션, 시설 상세 사진, 알림 모달, 챗 창, QR 모달, 회원정보 박스, 문의 안내 박스 |
| 20px | `rounded-[20px]` | 홈 행사 카드, 이용안내 이미지 |
| 28px / 40px | | 사업소개 히어로 / 홈 행사 사진 패널 우측 |
| 알약 | `rounded-full` | 검색바, 배지, 원형 아이콘 버튼, 알약형 CTA(아래) |

**알약형 CTA**(현재 화면 곳곳에서 사각 버튼과 혼용 중): 시설 상세 `예약하기` 56px, 예약 흐름 `달력 조회하기`/`예약하기` 52px, 게시글 `목록` 60px, 문의 `글쓰기` 48px, 마이페이지 표 안 `자세히 보기`/`QR 보기` 40px.

### 5.2 보더

| 용도 | 값 |
|---|---|
| 카드·표 행·구분선 | 1px `border-line` (#E2E8F0) |
| 입력칸·드롭다운·토글·아웃라인 버튼 | 1px `border-line-strong` (#CBD5E1) |
| 게시판 표 상단선 | 2px `border-foreground/80` (FAQ 목록만 1px `border-foreground`) |
| 게시판 검색바 | 2px `border-black` (기본형은 2px `border-foreground`, focus 시 accent) |
| 챗 위젯 버튼 | 3px `border-accent` |

### 5.3 그림자 — 실측

| 요소 | 값 |
|---|---|
| 시설 카드 | `0 1px 3px rgba(15,23,42,.06)` → hover `0 4px 16px rgba(15,23,42,.09)` + 보더 `line-strong` |
| 메가메뉴 | `0 4px 16px rgba(15,23,42,.09)` |
| 드롭다운 목록 | `0 8px 24px rgba(15,23,42,.12)` |
| 언어 메뉴 | `0 4px 16px rgba(15,23,42,.12)` |
| 모바일 드로어 | `0 12px 24px rgba(15,23,42,.12)` |
| 홈 행사 카드 | `0 2px 8px rgba(145,155,185,.25)` |
| 로딩 카드 | `0 4px 24px rgba(145,155,185,.18)` |
| 스크롤 유도 원 | `0 4px 14px rgba(15,23,42,.18)` |
| 사진 위 배지·즐겨찾기 버튼 | `shadow-sm` |
| 모달·QR 모달 | `shadow-xl`, 챗 창 `shadow-2xl`, 챗 버튼 `shadow-lg` |

**쓰지 않는 곳**: 필터 패널, 게시판 표, 입력칸, 예약 흐름 카드, 예약 접이식 섹션, 홈 "이렇게 이용하세요" 카드.

---

## 6. 모션

- 기본 전환은 Tailwind `transition` 기본값(150ms, `cubic-bezier(.4,0,.2,1)`)이다.
- 홈 헤더 투명 ↔ 솔리드 300ms, 행사 카드 hover 시 위로 20px 이동 300ms.
- 메가메뉴: `-translate-y-1.5 opacity-0` → `translate-y-0 opacity-100`.
- 드롭다운·FAQ·접이식 섹션 chevron은 열리면 180° 회전.
- 히어로 하단 스크롤 유도 원은 `animate-bounce`, 챗 버튼 hover 시 살짝 위로 이동.
- 로딩 스피너: 빨강·네이비 두 원이 1.2s 주기로 좌우 자리를 맞바꾼다(`animate-orbit-a/b`).
- 행사 캐러셀 자동 재생 4초, 끝에서 무한 순환.

---

## 7. 아이콘 · 이미지 · 로고

- **아이콘**: 인라인 라인 SVG, stroke 1.4~2.4, 끝·모서리 round. 크기는 16 / 18 / 20 / 24px가 대부분. 외부 아이콘 라이브러리 없음.
- **듀오톤 예외**: 홈 "이렇게 이용하세요" 아이콘 4개(viewBox 40, 48px 표시, 베이스 `#BCC8F2` + 딥 `#2745B3` + 배지 `#1E3A8A`). 회원가입 단계 아이콘도 별도 SVG 세트.
- **텍스트 글리프**: 히어로 CTA의 `→`, 문의 안내 목록의 `◦`는 이모지가 아닌 글자로 쓴다.
- **이미지** (`public/`)

| 자산 | 위치 | 사용처 |
|---|---|---|
| 배드민턴 코트 일러스트 | `hero-court.png` | 홈 히어로 풀스크린 배경(`object-[62%_38%]`) + 크림 베일 |
| 시설 사진 | `public/gyms/` (`getGymThumbnail`) | 시설 카드 176px 썸네일, 상세 4:3 사진. 없으면 `accent-tint → surface-2` 그라데이션 + 건물 아이콘 |
| 행사 사진 | `public/events/`, `events-panel.png` | 홈 행사 카드·패널 배경 |
| 이용안내 이미지 | `public/guide/` | `/guide` 단계별 3:2 이미지 |
| 마스코트 | `login-character.png`, `signup-character.png` | 로그인·회원가입 상단, 챗 위젯 버튼 |

- **로고**: 이미지가 아니라 텍스트 워드마크 `서울체육예약` + 우상단 ㄱ자 마크(SVG). 800 / -0.02em / `#2745B3`, 헤더에서 24px. [`brand-logo.tsx`](../src/components/ui/brand-logo.tsx)

---

## 8. 컴포넌트 (고객 화면)

### 8.1 재사용 프리미티브 — 새로 만들지 말고 이것을 쓴다

| 컴포넌트 | 규격 |
|---|---|
| [`ui/app-button`](../src/components/ui/app-button.tsx) `Button` / `ButtonLink` | base `rounded-lg font-bold`, focus `ring-2 ring-accent ring-offset-2`, disabled `opacity-60`. <br>variant: primary `bg-accent text-white hover:bg-accent-hover` · outline `border-line-strong bg-white hover:border-accent hover:text-accent-strong` · ghost `text-muted hover:bg-surface-2` · danger `bg-error text-white` · danger-outline `border-error/30 text-error`. <br>size: sm `h-9 px-[14px] 14.5px` · **md `h-11 px-[19px] 15.5px`(기본)** · lg `h-12 px-7 16.5px` · console `h-9 px-3.5 13px` · xs `h-7 rounded-md px-2.5 12px` |
| [`ui/select-menu`](../src/components/ui/select-menu.tsx) | 네이티브 `<select>` 대체. 트리거 룩은 화면이 지정(필터: `h-12 rounded-[10px] border-line-strong px-3.5 text-[15px]`). 목록 `rounded-lg border-line py-1.5` + 드롭다운 그림자, 옵션 `px-4 py-2.5 text-[15px] text-muted`, 선택 `font-semibold text-accent-strong`, hover `bg-surface-2` |
| [`ui/board-pagination`](../src/components/ui/board-pagination.tsx) | 칸 `size-10 rounded-lg border-line text-[14px] text-muted`, 활성 `bg-accent text-white`, 처음/이전/다음/끝은 chevron 아이콘(끝에서 비활성). 번호 최대 5개. 여백 board `mt-20 mb-14` / compact `py-3` |
| [`home/search-bar`](../src/components/home/search-bar.tsx) | 알약 검색 폼(공지·FAQ가 사용). board형 `646×68px border-2 border-black` + 검정 원형 버튼 48px, 기본형 `680×60px border-foreground` + 네이비 원형 버튼 40px. 좌측 필드 드롭다운(전체/제목/내용) |
| [`ui/alert-modal`](../src/components/ui/alert-modal.tsx) | **실제 알림 SSOT**. 딤 `bg-black/40`, 카드 `312px min-h-186 rounded-2xl px-6 py-7` 가운데 정렬, 제목 "알림" 20px/700, 메시지 16px, 버튼은 테두리 없는 텍스트 버튼(확인=`accent-strong`, 닫기=`slate-500`) |
| [`ui/collapsible-section`](../src/components/ui/collapsible-section.tsx) | 예약하기·예약 상세의 접이식 박스. `rounded-2xl bg-white px-8 py-6`, **보더 없음**, 제목 20px/700, 설명 14px `slate-500`, 우측 chevron |
| [`ui/brand-logo`](../src/components/ui/brand-logo.tsx) | §7 참고 |

### 8.2 전역 크롬

- **헤더 / 메가메뉴**: §4.2. GNB는 `시설 찾기 · 이용 안내 · 문의·FAQ · 공지사항` 4개(사업 소개는 임시 제외). hover 시 글자 `accent-strong` + 하단 3px 네이비 밑줄이 좌→우로 펼쳐진다. `시설 찾기` hover 메가메뉴: 폭 400px, `rounded-b-xl border-line px-[26px] py-6`, 그룹 제목 13px/700 `subtle`, 항목(종목 5개) `15.5px text-muted`, hover `bg-accent-tint text-accent-strong`, 클릭 시 `/gyms?sport=`.
- **언어 선택**: `KR ⌄` 텍스트 버튼 → 120px 드롭다운, 선택 언어 `font-bold text-accent-strong`.
- **푸터**: `bg-slate-900`, 글자 14.5px `slate-400`. 컬럼 제목 15.5px/700 `slate-200`, 고객센터 전화 23px/800 흰색, 저작권 13px `#64748B` + 상단 구분선 `#1E293B`. 모바일은 2열 그리드, 링크 터치 높이 44px.
- **챗 위젯(FAQ 안내봇)**: 우하단 `bottom-5 right-5`, 100px 원 + 3px 네이비 테두리 + 마스코트 사진 + 흰 알약 라벨 "채팅상담"(11px/700). 열면 `380×560px rounded-2xl border-line`, 헤더 `bg-accent` 흰 글씨 15px/700, 입력칸 `h-10 rounded-lg`, 추천 질문은 `rounded-lg border-line` 버튼.
- **로딩(`app/loading.tsx`)**: 전체 화면 `bg-background`, 가운데 300px 흰 카드 `rounded-2xl` + 두 원 스피너, 문구 17px/700 `#252525` + 14px `#9B9B9B`.
- **404**: 가운데 정렬, eyebrow 15px → h1 26~32px/800 → 설명 15px → CTA 2개(`h-12 rounded-[10px]`, 솔리드 + 네이비 아웃라인).

### 8.3 홈

위에서부터 `히어로 → 이렇게 이용하세요 → 가까운 체육시설 → 행사·대회` 4섹션. 섹션은 [`app/page.tsx`](../src/app/page.tsx)에서 조립한다.

- **히어로**: `min-h-[100svh]` 풀스크린 일러스트, 헤더가 위에 겹친다. 좌측 텍스트: h1 46px 네이비(`accent-strong`) 2줄 → 부제 18px/500 `slate-600` 최대 460px → CTA 2개(`h-14 rounded-[10px] px-6 15px/700`, 솔리드 `시설 검색하기 →` + 흰 반투명·네이비 테두리 `이용 방법 안내 →`). 하단 중앙에 36px 흰 원 스크롤 유도.
- **이렇게 이용하세요**: eyebrow `GUIDE` + h2 31px + 부제. 카드 4개 `rounded-xl border-line bg-white px-6 py-7`, **그림자·hover 없음**(안내용, 클릭 불가), 아이콘 48px → 제목 18.5px/700 → 설명 15px `muted`.
- **가까운 체육시설**: eyebrow `FACILITIES` + h2 + 부제, 시설 카드 3개(§8.4).
- **행사·대회**: 좌측 사진 패널(762×750, 우측만 40px 둥글게, 네이비 오버레이) 안에 eyebrow 18px + h2 34px/600 흰색(강조어 `#9DB4FF`) + 세로 탭 4개(각 68px, 22px, 흰 28% 구분선, 활성은 흰 원 화살표). 우측 캐러셀 카드 3장(사진 카드 380px 높이 / 공지 카드 360px, `rounded-[20px]`, 카테고리 배지 `rounded-[25px] bg-[#D3E1FB] 14px/500`, 제목 22px/600, 날짜 14px `#555`). hover 시 위로 20px + 네이비 보더 + `accent-tint`. 컨트롤 60px 원 3개(이전·다음·재생/정지).

### 8.4 시설 찾기 · 시설 상세

- **필터 패널**: `rounded-2xl border-line bg-white p-5 sm:p-6`, **그림자 없음**. 지역·종목·체육관 드롭다운(`h-12 rounded-[10px]`) + `시설 검색` 버튼(lg, 147×48). 아래 `border-t` 후 우측 정렬 토글.
- **정렬·필터 토글**: `h-10 rounded-md border px-3 text-sm font-semibold`, 활성 `border-accent bg-accent-tint text-accent-strong`, 비활성 `border-line-strong bg-white text-muted`. `가까운 순` / `가격순`(재클릭 시 오름↔내림) / `☆ 즐겨찾기`.
- **시설 카드** ([`facility-card`](../src/components/gym/facility-card.tsx) 홈, [`gym-card`](../src/components/gym/gym-card.tsx) 목록 — 같은 룩):
  `rounded-xl border-line bg-white` + 카드 그림자 → 썸네일 176px(사진) + 좌상단 "● 예약 가능" 흰 알약 배지(12.5px/700 `success`) → 본문 `p-5`: 제목 19.5px/700 → 핀 아이콘 + 주소 14.5px → 종목 태그(`rounded-md border-line bg-surface-2 px-[11px] py-[5px] 13px/600`) → `border-t` 아래 가격(§3.3) + `예약하기` 버튼(md, 좌우 32px, 121×44).
  목록 카드만 우상단 36px 흰 원 즐겨찾기 별(`amber-400`), 주소 줄 끝에 거리(`accent-strong`).
- **시설 상세**: breadcrumb 3단 → h1 32px + 우측 44px 원형 즐겨찾기(별 `#F5B50A`) → 2열(`gap-[60px]`): 좌 4:3 사진 `rounded-2xl`, 우 정보표(행 구분 `divide-line`, 라벨 128px 19px/700, 값 19px `muted`) → 탭 3개(예약 정보·지도·준수사항) → 지도 460px `rounded-xl border` → 하단 `border-t` 뒤 가운데 알약 CTA `예약하기`(160×56, 18px/700).

### 8.5 예약 흐름

- **레이아웃**: `bg-background` 위에 1200px 컬럼. 좌측 흰 카드들이 세로로 쌓이고(`gap-5` / 섹션 간 `gap-8`), 우측 378px 요약이 sticky.
- **상단 카드**: `rounded-2xl bg-white px-8 py-6`, 36px 원형 뒤로가기 + 체육관명 20px/700.
- **접이식 섹션**: `collapsible-section` 사용. 예약 종목 → (달력) → 이용 인원 → 예약자 정보 → 약관 → 결제 수단. 접히면 선택값 요약을 보여준다.
- **선택 리스트 항목**(종목·결제수단): `rounded-xl border px-4 py-3.5`, 좌측 24px 체크 원 + 라벨 16px/500 + 우측 가격 16px/600. 선택 시 `border-accent bg-accent-tint`, 가격 `accent-strong`.
- **단계 확인 버튼**: `h-11 min-w-[92px] rounded-lg border px-4 14px/600` (선택완료).
- **달력**: 안내 박스 2개(`rounded-xl bg-slate-50`, 라벨 14px + 값 16px/700 `accent-strong`) → 월 28px/700 + 28px 원형 화살표 → 요일 16px → 날짜 칸 `h-14 max-w-[98px] rounded-md`: 선택 `bg-accent` 흰 글씨, 일요일 `error`, 불가 `slate-300`, 오늘은 날짜 아래 11px 라벨.
- **시간 슬롯**: 4열 `gap-4`, 각 `min-h-14 rounded-md border 14px/600`, 시간만 표시.

| 상태 | 스타일 |
|---|---|
| 예약 가능 | `border-line-strong text-foreground`, hover `border-accent text-accent-strong` |
| 선택됨 | `border-accent bg-accent text-white` |
| 마감·지난 시간·운영 중지 | `border-line bg-surface-2 text-subtle` + `cursor-not-allowed` (**취소선 없음**) |
| 내 예약과 중복 | `border-accent/30 bg-accent-tint text-accent-strong` |

- **인원 ±**: 40px 정사각 `rounded-md border-slate-300`, 기호 20px.
- **예약자 정보**: 라벨 160px + 값 그리드, 입력칸 `h-11 rounded-lg border-slate-300 16px`, focus `border-accent`.
- **우측 요약**: 흰 `rounded-2xl` 박스 2개("나의 예약 정보" / "결제 금액", 제목 24px/700, 행 14px). 합계 바 `h-[54px] rounded-lg bg-accent-tint` 16px/700 `accent-strong`.
- **주요 CTA**: 알약 `h-[52px] w-[151px] rounded-full bg-accent 16px/500`. 비활성 `bg-line-strong text-subtle`.
- **예약 완료**: h1 36px 가운데 → 720×410 흰 카드 `rounded-2xl` 안에 56px 초록 체크 원(`#27AE60`) + 24px/700 제목 + 18px 설명 + 60px 알약 버튼.
- **예약 상세**: 1200px, 표준 breadcrumb·h1 + 접이식 섹션(예약자 정보·예약 확인·결제 내역). 강조 행 `rounded-lg bg-slate-50`, 값 16px/700 `accent-strong`. 하단 액션 `h-[44px] w-[94px] rounded-md border-line-strong 14px/600`.
- **QR 체크인 모달**: 딤 `bg-black/50`, 창 최대 460×860 `rounded-2xl p-[42px]`(모바일 전체 화면). 제목 22px/700 → 310px QR 카드(`rounded-2xl border shadow-sm`, 상단 `bg-accent` 18px/700 흰 띠) → 정보 행 18px(라벨 600 `slate-700` / 값 `slate-900`, 구분 `border-slate-100`).

### 8.6 게시판형 화면

- **탭**: `grid` 균등 분할(2 → 4열, 시설 상세는 3열), 각 탭 `-mb-px border-b-2 py-4 text-center text-[18px] sm:text-[22px]`(실측 높이 69px).
  활성 `border-accent font-bold text-accent-strong` / 비활성 `border-transparent font-medium text-muted hover:text-foreground`. 탭 줄 아래 full-bleed 1px `bg-line`.
- **공지 목록**: 가운데 board형 검색바 → 표(`border-t-2 border-foreground/80`, `thead`는 화면에 안 보임 `sr-only`). 행 높이 100px(모바일 64px), 행 구분 `border-line`, hover `bg-surface-2`.
  **주요공지** 행은 `bg-accent-tint` + 번호 자리에 알약 배지(`h-9 rounded-[25px] bg-accent px-3.5 13px/700` 흰 글씨), 마지막 주요공지 아래 2px 굵은 선. 제목 18px/500, 작성자·날짜 16px `muted` tabular.
- **FAQ**: 탭 4개(가입·계정 / 예약·취소 / 결제·환불 / 문의) → board형 검색바 → 목록(`border-t border-foreground`). 질문 행 `px-10 py-7`: 36px 네이비 원 "Q" + 질문 22px/500 + 24px chevron. 펼치면 `bg-accent-tint` 답변 영역(네이비 원 "A" + 16px 본문). 5개씩 페이지네이션.
- **문의 탭(공개 문의 게시판)**: 안내 박스 `1400×173 rounded-2xl bg-[#EEF3FC] px-10` (제목 20px/700 `accent-strong` + 18px `slate-600` 목록) → h2 "문의 게시판" 34px/700 + 우측 `글쓰기` 알약(120×48 `rounded-[30px] bg-accent 16px/600`) → 표.
- **게시판 표 표준**(문의·마이페이지):
  상단선 `border-t-2 border-foreground/80` → `thead` `bg-surface-2 border-b border-line`, `th` `h-[72px]` 18px → 셀 18px, 세로 구분 `border-l border-line`, 행 `border-b border-line hover:bg-surface-2`, 숫자·날짜 `tabular-nums`.
  행 높이: 문의 72px, 마이페이지 예약·즐겨찾기 81px(기본값 106px). 빈 상태는 경고 아이콘 + "…이 없습니다" 18px(표 안).
- **마이페이지**: breadcrumb·h1·부제 → 탭 4개(예약내역·즐겨찾기 내역·문의 내역·회원정보변경) → `mt-[72px]` 게시판 표. 표 안 액션은 알약 버튼(`117.92×40 rounded-full border-line-strong 14px/600`, hover 시 네이비 채움).
- **게시글 상세**(공지·문의): 제목 26~36px/700 `#1D1D1D` → 메타 15~16px `#555`(구분자 `line-strong`) → `border-b` → 본문 16~18px / lh 1.8 → 이전·다음 글 행(`border-y`) → 가운데 `목록` 알약(160×60 `rounded-[30px] bg-accent 18px/500`, hover `accent-strong`).

### 8.7 폼

| 폼 | 컨트롤 | 라벨 |
|---|---|---|
| 필터·검색(시설 찾기) | `h-12 rounded-[10px] border-line-strong px-3.5 15px`, focus `border-accent ring-2 ring-accent/20`, 비활성 `bg-surface-2` | 12.5px/700, 래퍼 `flex-col gap-1.5` |
| 예약자 정보 | `h-11 rounded-lg border-slate-300 16px` | 16px, 160px 라벨 칸 |
| 회원정보 변경 | 800px 폭, `rounded-2xl bg-surface-2 p-[60px]` 박스 안 `h-[56px] rounded-md border-line-strong px-4 16px`, focus `border-[#111]`, 읽기 전용 `bg-[#E4E4E4]` | 18px/700 `slate-800`, 필수 `*` `error` |
| 인증 | §9 | |

- 오류 박스: `rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error` + `role="alert"`.
- 빈 상태(카드형): `rounded-xl border border-dashed border-line-strong bg-white p-10 text-center`, 제목 16px/700 + 설명 14px + 다음 행동 버튼.

---

## 9. 인증 화면 (별도 디자인 언어)

로그인·회원가입·비밀번호 찾기는 **모바일 앱형 단일 컬럼**이다. 전역 GNB·푸터·챗 위젯이 없고, 색도 네이비 대신 무채색 + 블루를 쓴다.

| 요소 | 값 |
|---|---|
| 배경 | 흰색 단색 |
| 상단 바 | 높이 61px, 하단 `#C9C9C9` 1px, 가운데 제목 22px/700 `#252525`, 좌측 뒤로가기 chevron |
| 컬럼 | `max-w-[520px] px-5 pt-[39px]` (내용 480px) |
| 마스코트 | 160×159.5px, 제목 위 |
| 제목 | 23px/700 lh 1.3 `#252525` 가운데 |
| 입력칸 | `h-[50px] rounded-[3px] border-[#D0D0D0] px-3 16px`, 플레이스홀더 `#9B9B9B`, focus `border-accent`, 칸 사이 13px |
| 보조 링크·체크 | 15px `#252525`, 20px 원형 체크 |
| 주 버튼(로그인) | `h-[60px] rounded-[3px] bg-[#121212] 18px/500` 흰 글씨 (가입 단계 버튼은 56px / 17px) |
| 보조 버튼(회원가입) | `h-[60px] rounded-[3px] bg-[#3B82F6] 18px/500` |
| 구분선 | `#E3E3E3`, 상하 32px |
| 소셜 로그인 | 80px 원 4열(카카오·네이버·구글·페이스북), 아래 라벨 15px |
| 회원가입 단계 표시 | 아이콘 + 라벨 18px/500. 현재 `#3B82F6`, 완료 `#252525`, 대기 `#C9C9C9`, 연결선 `#D0D0D0` |
| 약관 체크 | 켜짐 `#3B82F6` / 꺼짐 `#E3E3E3`, 약관 본문 `bg-[#F7F7F7] 13px #555` |
| 성공 표시 | `#22A36B` |

---

## 10. 관리자 콘솔 (별도 디자인 언어)

고객 화면은 **읽는** 화면이고 콘솔은 **조작하는** 화면이다. 같은 규격을 쓰면 한 화면에 절반밖에 안 들어온다.
색은 §2.5 퍼플 스코프, 폰트는 Pretendard. **그라디언트·그림자·이모지 없음**, 구분은 하이라인 보더로만 한다.
공공기관 톤을 위해 금액 노출을 줄이고 메뉴명도 "매출" 대신 **"정산"** 을 쓴다.

### 10.1 셸 — [`admin-shell.tsx`](../src/components/admin/admin-shell.tsx)

| 영역 | 값 |
|---|---|
| 사이드바 | `w-64`(256px) 흰 배경 + `border-r`, `lg` 이상에서 sticky. 상단 "운영 콘솔" 16px/700 (`h-16`) |
| 메뉴 그룹 | 운영(대시보드·시설·예약·슬롯) / 고객(고객·문의) / 성과(정산·배너) / 기록(운영 이력·접속 기록). 그룹 라벨 10.5px/700 / 0.07em `subtle` |
| 메뉴 항목 | `h-11 rounded-xl px-3 15px` + 아이콘 20px. 활성 `bg-accent-tint font-semibold text-accent-strong`(라벤더), 비활성 `font-medium text-muted hover:bg-surface-2` |
| 하단 | `고객 사이트로` 링크 `h-10 rounded-xl 14px` |
| 상단바 | `h-16`(64px) 흰 배경 + `border-b`. 검색칸 256~320×40 `rounded-xl bg-surface-2`, 빠른 이동 알약 `h-9 rounded-xl 14px`(활성 라벤더), 우측 사람 아이콘 원 36px + 마스킹 이메일 13.5px + 로그아웃 `h-9 rounded-xl border` |
| 본문 | `p-4 sm:p-6`, 캔버스 `#F7F7F9`, 페이지 제목 20px/700 + 설명 13px `subtle` |
| 대시보드 | 좌측 본문 + 우측 활동 패널 `xl:w-75`(300px) 2단 |

### 10.2 밀도 규격 — [`admin-ui.tsx`](../src/components/admin/admin-ui.tsx)

| 항목 | 고객 화면 | 관리자 콘솔 |
|---|---|---|
| 페이지 제목 | h1 28 → 32px | 20px |
| 본문 | 15 ~ 16.5px | 13.5px |
| 패널 | `rounded-2xl p-5 sm:p-6` | `rounded-xl border-line bg-white p-4 sm:p-5`, 제목 15px/700 + 설명 12.5px |
| KPI 카드 | — | `rounded-xl border p-4`, 라벨 12px/700 `muted`, 숫자 24px/700, 진행바 8px `rounded-full`, 보조 12px |
| 표 | 굵은 상단선 + 세로 구분선, 헤더 18px / 72px | 카드 안 표(`rounded-xl border`), 세로 구분선 없음. 헤더 `bg-surface-2` 12px/700 `muted` / 42px, 셀 13.5px / 48px, hover `surface-2/60`, 선택 행 `accent-tint` |
| 컨트롤 | `h-12 rounded-[10px] 15px` | `h-9 rounded-lg border-line-strong px-3 13px`, focus `ring-accent/20` |
| 필드 라벨 | 12.5px | 11.5px/700 `muted` |
| 버튼 | md(h-11) / lg(h-12) | `console`(h-9, 기본) / `xs`(h-7, 표 안 인라인 액션) |
| 토글 | 동일 의미 | 활성 `border-accent bg-accent-tint text-accent-strong` |
| 상태 배지 | 배경 틴트 | 보더 있는 알약 `h-6 11.5px/700` |
| 모서리 | 요소별 6~16px | 거의 전부 `rounded-xl`(12px), 컨트롤만 `rounded-lg` |

### 10.3 SSOT 파일

| 파일 | 역할 |
|---|---|
| `globals.css` `.admin-console` | 관리자 색·폰트(이 블록만 바꾸면 콘솔 전체가 바뀐다) |
| `admin/admin-ui.tsx` | 패널·표·셀·컨트롤·토글 규격 |
| `admin/admin-nav-items.ts` | 메뉴(그룹·아이콘 키). 사이드바가 이 배열만 본다 |
| `admin/admin-nav-icons.tsx` | 메뉴 아이콘 SVG |
| `admin/admin-shell.tsx` | 사이드바 + 상단바 + 캔버스. 각 화면은 본문만 렌더한다 |
| `admin/admin-charts.tsx` | 차트 색(고정 hex) |
| `admin/admin-auth-gate.tsx` | Basic Auth 다음 단계의 Firebase 로그인 + `admin` 클레임 게이트 |

**대시보드 원칙**: 숫자는 서버가 실제로 주는 값만 쓴다. 목표 대비 달성률·전일 대비 증감처럼 근거 API가 없는 지표는 넣지 않는다.
관리자 콘솔은 i18n 대상이 아니다(운영자 전용, 국문 고정).

---

## 11. 변경 방법

이 프로젝트는 마무리까지 색·버튼 크기·레이아웃이 계속 바뀐다는 전제로 **토큰만 바꾸면 따라오게** 만들었다.

- **고객 대표색 교체**: `globals.css :root`의 `--accent*` 5줄. §2.1 2톤 규칙과 대비 기준을 확인한다. 단 §2.4의 하드코딩 색(로고 `#2745B3`, 홈 아이콘, 행사 섹션 등)은 **따로 바꿔야 한다**.
- **관리자 색 교체**: `globals.css .admin-console` 블록 + `admin-charts.tsx`의 hex.
- **버튼 크기·모양 일괄 변경**: `ui/app-button.tsx`의 `variantClass` / `sizeClass`. 단 §12의 버튼 재정의 지점은 따라오지 않는다.
- **폰트 교체**: `layout.tsx`의 `Noto_Sans_KR`(또는 `localFont` Pretendard) + `globals.css`의 `--font-noto-sans-kr` / `--font-pretendard` 참조.
- **컨테이너 폭**: 현재 `max-w-[1440px]`가 각 파일에 직접 적혀 있다(`--container-max` 변수는 미사용). 바꾸려면 `rg "max-w-\[1440px\]"`로 일괄 수정한다.
- 새 컴포넌트는 hex를 직접 쓰지 말고 토큰 유틸(`bg-accent`, `border-line` 등)을 쓴다.

---

## 12. 현재 드리프트 · 정리 후보

실측 중 확인한, 원칙과 실제 화면이 어긋난 지점이다. **아직 코드는 바꾸지 않았다.** 정리할 때 이 목록에서 고른다.

1. **하드코딩 색이 토큰 밖에 있다** — 인증 화면 전체(`#252525` 한 색만 57회, 대부분 인증 화면), 홈 행사 섹션, 게시글 상세의 `#1D1D1D`/`#555`, 로고. 대표색을 바꿔도 이 부분은 그대로 남는다.
2. **인증 화면이 브랜드 네이비를 쓰지 않는다** — 로그인 버튼은 검정 `#121212`, 회원가입·단계 표시는 블루 `#3B82F6`. 같은 서비스 안에서 파랑이 두 종류다.
   → **결정(2026-09-26): 지금 스타일 유지.** 블루만 대비 기준을 넘도록 `#2563EB`로 진하게(코드 미반영).
3. **CTA 모양이 두 갈래다** — `app-button`은 8px 사각인데, 히어로·404는 10px 사각, 시설 상세·예약 흐름·게시글·글쓰기·마이페이지 표는 알약형이다. 크기도 40/44/48/52/56/60px로 흩어져 있다.
   → **결정(2026-09-26): 고객 화면 텍스트 버튼은 전부 알약형**, 높이 44·48px(코드 미반영, 관리자·인증 화면 제외).
4. **`app-button` 밖에서 버튼을 다시 정의한 곳** — 히어로 CTA, 404 CTA, 시설 상세 `예약하기`, 예약 흐름 CTA(`w-[150.88px]`), 게시글 `목록`, 문의 `글쓰기`, 마이페이지 표 알약, 예약 상세 액션(`h-[44px] w-[94px] rounded-md`), 시설 목록 빈 상태 버튼(`h-10 rounded-md`), 시설 상세 로그인 모달 버튼.
5. **[`src/components/AGENTS.md`](../src/components/AGENTS.md)의 버튼 규칙이 실제와 다르다** — 문서는 `rounded-md h-10/h-11`, 실제 `app-button`은 `rounded-lg h-9/11/12`.
6. **예약 흐름 화면만 `slate-*` 보더를 쓴다** — 다른 화면은 `border-line`인데 예약 폼·인원 버튼·입력칸은 `border-slate-200/300`.
7. **쓰이지 않는 토큰·컴포넌트** — 토큰 `--r-sm/--r/--r-lg`, `--container-max/--container-pad`. 컴포넌트 `HomeSearch`, `HomeBanner`, `HomeReservationPreview`, `ui/modal`, `ui/notice-banner`, `ui/form-fields`(미사용 `PasswordChangeView`만 참조), `WithdrawView`, `FavoriteButton`.
8. **즐겨찾기 색이 화면마다 다르다** — 목록 카드 `amber-400`, 상세 `#F5B50A`, 미사용 `FavoriteButton`은 rose.
9. **마이페이지 예약 상태가 배지가 아닌 평문이다** — §2.3 상태 배지 SSOT와 표현이 다르다.
10. **관리자 코드 주석이 옛 상태를 말한다** — `admin-ui.tsx` 상단 주석("accent 토큰은 고객 화면과 같은 SSOT"), `AdminTd` 주석("JetBrains Mono")은 현재 퍼플 스코프·Pretendard와 다르다.

---

## 13. 참고 자산

- 화면 캡처: [`docs/images/`](images/) (홈·시설 찾기·예약·QR·관리자 대시보드·정산·FAQ 안내봇)
- 초기 시각 시안: `design-preview-gym-v6.html`(작업 디렉터리 밖, Downloads). 정적 시안이라 현재 화면과 다른 부분이 많다. **현재 기준은 이 문서다.**
