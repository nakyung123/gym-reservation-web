"use client";

import { useEffect, useRef, useState } from "react";

// 홈 "전국 스포츠 행사·대회" 영역.
// KMI(한국의학연구소) 메인의 'KMI 소식' 섹션 구성을 그대로 옮긴 레이아웃:
//   좌측 네이비 패널(eyebrow + 큰 헤딩 + 세로 카테고리 탭) + 우측 카드 캐러셀(화살표·재생/일시정지).
// KMI 실측 px(데스크톱 1440)을 따른다: 카드 폭 245 / gap 10 / radius 20 / 이미지 139 /
//   본문 padding 20 24 / 배지 radius 25·padding 5 10 / 제목 22·600·line 33 / 날짜 14·#555.
// 좌패널 배경은 사진 대신 브랜드 네이비 그라데이션(자산 불필요, 토큰 일관).
// 외부 대회·행사를 큐레이션해 보여주는 영역이라 각 카드는 외부 링크(새 탭). 현재는 더미(href 추후 교체).
// 데이터/탭은 배열에서만 관리한다. (구조 유연성 우선)

type EventCategory = "대회" | "생활체육" | "강좌";

type EventPost = {
  category: EventCategory;
  title: string;
  period: string;
  href: string;
};

// 좌측 세로 탭. "추천"은 전체를 보여주고 나머지는 category로 필터한다.
const TABS = ["추천", "대회", "생활체육", "강좌"] as const;
type Tab = (typeof TABS)[number];

const EVENTS: EventPost[] = [
  {
    category: "대회",
    title: "2026 서울하프마라톤 참가자 모집",
    period: "접수 06.01 ~ 07.15",
    href: "#",
  },
  {
    category: "생활체육",
    title: "제12회 구민 생활체육 대축전",
    period: "접수 06.10 ~ 07.05",
    href: "#",
  },
  {
    category: "대회",
    title: "전국 동호인 배드민턴 오픈 대회",
    period: "접수 06.15 ~ 07.20",
    href: "#",
  },
  {
    category: "대회",
    title: "여름 3x3 길거리 농구 리그",
    period: "접수 06.20 ~ 07.10",
    href: "#",
  },
  {
    category: "생활체육",
    title: "주말 풋살 클럽 매치 시즌2",
    period: "접수 06.05 ~ 07.31",
    href: "#",
  },
  {
    category: "대회",
    title: "지역 탁구 동호회 친선 토너먼트",
    period: "접수 06.18 ~ 07.18",
    href: "#",
  },
  {
    category: "강좌",
    title: "초보자 수영 교실 (여름학기)",
    period: "접수 06.12 ~ 06.30",
    href: "#",
  },
  {
    category: "강좌",
    title: "시니어 건강체조 교실",
    period: "접수 06.08 ~ 06.28",
    href: "#",
  },
];

// 카드 한 칸 이동량(폭 245 + gap 10).
const CARD_STEP = 255;
// 자동 재생 간격(ms).
const AUTOPLAY_MS = 3500;

function ArrowIcon({ dir }: { dir: 1 | -1 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      {dir === -1 ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

const CTRL_BTN_CLASS =
  "grid size-11 place-items-center rounded-full border border-line-strong bg-white text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function HomeEvents() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("추천");
  const [playing, setPlaying] = useState(true);

  const visibleEvents =
    activeTab === "추천"
      ? EVENTS
      : EVENTS.filter((event) => event.category === activeTab);

  const scrollByCards = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({
      left: direction * CARD_STEP,
      behavior: "smooth",
    });
  };

  // 탭을 바꾸면 카드 목록이 달라지므로 레일을 처음으로 되감는다(이벤트 핸들러에서 처리).
  const handleTab = (tab: Tab) => {
    setActiveTab(tab);
    scrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  // 자동 재생: 끝에 닿으면 처음으로 루프. setState는 호출하지 않고 DOM 스크롤만 다룬다.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 8) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: CARD_STEP, behavior: "smooth" });
      }
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, activeTab]);

  return (
    <section className="overflow-hidden py-[56px] lg:pb-[120px] lg:pt-[72px]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:flex-row lg:items-stretch lg:px-8">
        {/* 좌측 네이비 패널 */}
        <div className="relative shrink-0 rounded-2xl bg-[linear-gradient(150deg,#1e3a8a_0%,#162a66_100%)] px-7 py-9 text-white sm:px-10 sm:py-12 lg:w-[40%] lg:max-w-[520px] lg:rounded-2xl lg:rounded-r-[40px] lg:px-[64px] lg:py-[88px]">
          <p className="text-[18px] font-semibold tracking-[0.02em] text-white/90">
            행사 소식
          </p>
          <h2 className="mt-3 text-[28px] font-semibold leading-[1.32] tracking-[-0.01em] sm:text-[34px]">
            전국의 스포츠
            <br />
            <span className="text-[#9db4ff]">행사·대회 소식</span>을
            <br className="hidden lg:block" /> 알려드립니다.
          </h2>

          {/* 세로 카테고리 탭(role=tablist). 데스크톱은 세로, 모바일은 가로 스크롤 */}
          <ul
            role="tablist"
            aria-label="행사 카테고리"
            className="mt-7 flex gap-1 overflow-x-auto lg:mt-12 lg:flex-col lg:gap-0"
          >
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <li key={tab} className="shrink-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTab(tab)}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-[16px] font-semibold transition lg:w-full lg:rounded-none lg:px-0 lg:py-[15px] lg:text-[22px] ${
                      active
                        ? "bg-white/15 text-white lg:bg-transparent"
                        : "text-white/55 hover:text-white/90"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`hidden h-[2px] rounded-full bg-[#9db4ff] transition-all lg:block ${
                        active ? "w-6" : "w-0"
                      }`}
                    />
                    {tab}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 우측 카드 캐러셀: 데스크톱에서 좌패널을 살짝 겹친다(layer 효과) */}
        <div className="relative z-10 mt-6 min-w-0 flex-1 lg:mt-0 lg:-ml-10 lg:flex lg:flex-col lg:justify-center lg:pl-10">
          {/* 컨트롤: 화살표 + 재생/일시정지 */}
          <div className="mb-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "자동 재생 멈춤" : "자동 재생 시작"}
              aria-pressed={playing}
              className={CTRL_BTN_CLASS}
            >
              {playing ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="size-[15px]"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="size-[15px]"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              aria-label="이전 행사 보기"
              className={CTRL_BTN_CLASS}
            >
              <ArrowIcon dir={-1} />
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              aria-label="다음 행사 보기"
              className={CTRL_BTN_CLASS}
            >
              <ArrowIcon dir={1} />
            </button>
          </div>

          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2"
          >
            {visibleEvents.map((event) => (
              <a
                key={event.title}
                href={event.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex w-[245px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-line bg-white transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {/* 이미지 영역(245x139). 더미라 카테고리 라벨 placeholder */}
                <div className="relative h-[139px] bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 grid place-items-center text-[15px] font-bold text-accent-strong/25"
                  >
                    {event.category}
                  </span>
                </div>

                <div className="flex flex-1 flex-col px-6 py-5">
                  <span className="w-fit rounded-[25px] bg-accent-tint px-2.5 py-[5px] text-[13.5px] font-medium text-accent-strong">
                    {event.category}
                  </span>
                  <p className="mt-3 line-clamp-2 text-[20px] font-semibold leading-[1.45] text-slate-950">
                    {event.title}
                  </p>
                  <span className="mt-3 text-[13.5px] text-[#555]">
                    {event.period}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
