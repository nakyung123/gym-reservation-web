"use client";

import { useEffect, useRef, useState } from "react";

// 홈 "전국 스포츠 행사·대회" 영역 — KMI(한국의학연구소) 메인 'KMI 소식' 섹션을 1:1로 재현.
// 구성: 좌측 네이비 패널(eyebrow + 큰 헤딩 + 세로 카테고리 탭) + 우측 카드 캐러셀.
// KMI 실측(데스크톱 1440):
//  - 좌패널: 화면 왼쪽 끝 flush, 우측 모서리 radius 40, 세로 탭(높이 68, 구분선 1px 흰28%,
//    라벨 좌·화살표 우 space-between, 활성=흰글씨+흰원28px에 우화살표 / 비활성=흰60%·원 숨김)
//  - 카드: 정확히 3개 노출(뷰포트 755 = 245*3 + 10*2). radius 20, 이미지 139,
//    본문 padding 20·24, 배지(연파랑) + 제목 22/600·line33 + 날짜 14·#555(하단)
//  - 캐러셀: Swiper 방식 transform 이동(네이티브 스크롤 없음). 화살표·재생/일시정지.
// 좌패널 배경은 사진 대신 브랜드 네이비 그라데이션. 외부 행사 링크(새 탭, 현재 더미).
// 탭/데이터는 배열에서만 관리. (구조 유연성 우선)

type EventCategory = "대회" | "공지사항" | "생활체육" | "강좌";

type EventPost = {
  category: EventCategory;
  title: string;
  date: string;
  href: string;
};

const TABS: EventCategory[] = ["대회", "공지사항", "생활체육", "강좌"];

const EVENTS: EventPost[] = [
  { category: "대회", title: "2026 서울하프마라톤 참가자 모집", date: "2026-06-01", href: "#" },
  { category: "대회", title: "전국 동호인 배드민턴 오픈 대회", date: "2026-06-15", href: "#" },
  { category: "대회", title: "여름 3x3 길거리 농구 리그", date: "2026-06-20", href: "#" },
  { category: "대회", title: "지역 탁구 동호회 친선 토너먼트", date: "2026-06-18", href: "#" },
  { category: "공지사항", title: "하계(7~8월) 운영시간 변경 안내", date: "2026-06-15", href: "#" },
  { category: "공지사항", title: "금천구민체육센터 신규 오픈 안내", date: "2026-06-01", href: "#" },
  { category: "공지사항", title: "예약 시스템 정기 점검 안내", date: "2026-06-10", href: "#" },
  { category: "생활체육", title: "제12회 구민 생활체육 대축전", date: "2026-06-10", href: "#" },
  { category: "생활체육", title: "주말 풋살 클럽 매치 시즌2", date: "2026-06-05", href: "#" },
  { category: "생활체육", title: "가족과 함께하는 체육 한마당", date: "2026-06-22", href: "#" },
  { category: "강좌", title: "초보자 수영 교실 (여름학기)", date: "2026-06-12", href: "#" },
  { category: "강좌", title: "시니어 건강체조 교실", date: "2026-06-08", href: "#" },
  { category: "강좌", title: "유소년 농구 교실 모집", date: "2026-06-14", href: "#" },
];

const CARD_W = 245;
const GAP = 10;
const CARD_STEP = CARD_W + GAP; // 255
const AUTOPLAY_MS = 4000;

// 뷰포트에 들어가는 카드 수(데스크톱 755 → 3, 모바일 → 1~2). 핸들러에서만 호출.
function perViewOf(viewport: HTMLElement | null): number {
  const w = viewport?.clientWidth ?? CARD_STEP * 3 - GAP;
  return Math.max(1, Math.floor((w + GAP) / CARD_STEP));
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-[46px] place-items-center rounded-full border border-line-strong bg-white text-slate-500 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}

export function HomeEvents() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<EventCategory>("대회");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const visibleEvents = EVENTS.filter((event) => event.category === activeTab);

  const maxIndex = () =>
    Math.max(0, visibleEvents.length - perViewOf(viewportRef.current));

  const goNext = () => setIndex((i) => Math.min(i + 1, maxIndex()));
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const handleTab = (tab: EventCategory) => {
    setActiveTab(tab);
    setIndex(0);
  };

  // 자동 재생: 끝에 닿으면 처음으로 루프(transform 기반, 스크롤 아님).
  // setState는 effect 본문이 아니라 인터벌 콜백에서 호출한다.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i >= maxIndex() ? 0 : i + 1));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
    // activeTab이 바뀌면 카드 목록·maxIndex가 달라지므로 인터벌을 재설정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeTab]);

  return (
    <section className="relative overflow-hidden bg-background py-12 lg:py-[84px]">
      <div className="flex flex-col px-5 sm:px-8 lg:flex-row lg:items-stretch lg:px-0">
        {/* 좌측 네이비 패널 (데스크톱 화면 왼쪽 끝 flush) */}
        <div className="relative shrink-0 rounded-2xl bg-[linear-gradient(150deg,#1f3c8c_0%,#15235c_100%)] px-7 py-9 text-white sm:px-10 sm:py-11 lg:w-[40%] lg:max-w-[560px] lg:rounded-2xl lg:rounded-l-none lg:rounded-r-[40px] lg:px-[64px] lg:py-[84px]">
          <p className="text-[18px] font-semibold tracking-[0.01em] text-white/90">
            행사 소식
          </p>
          <h2 className="mt-3 text-[27px] font-semibold leading-[1.34] tracking-[-0.01em] sm:text-[34px]">
            전국의 스포츠
            <br className="hidden sm:block" /> <span className="text-[#9db4ff]">행사·대회 소식</span>을
            <br className="hidden lg:block" /> 알려드립니다.
          </h2>

          {/* 세로 카테고리 탭(role=tablist) — 데스크톱 세로, 모바일 가로 */}
          <ul
            role="tablist"
            aria-label="행사 카테고리"
            className="mt-7 flex gap-1 overflow-x-auto lg:mt-12 lg:flex-col lg:gap-0 lg:overflow-visible"
          >
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <li
                  key={tab}
                  className="shrink-0 lg:border-b lg:border-white/[0.28]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTab(tab)}
                    className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 py-2.5 text-[16px] font-semibold transition lg:w-full lg:rounded-none lg:px-3 lg:py-0 lg:h-[68px] lg:text-[22px] ${
                      active
                        ? "bg-white/15 text-white lg:bg-transparent"
                        : "text-white/60 hover:text-white/90"
                    }`}
                  >
                    <span>{tab}</span>
                    {/* 활성 탭: 흰 원 + 우측 화살표(데스크톱) */}
                    <span
                      aria-hidden="true"
                      className={`hidden size-7 shrink-0 place-items-center rounded-full bg-white text-accent-strong transition-opacity lg:grid ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-[13px]"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 우측: 컨트롤 + 카드 캐러셀(transform). 데스크톱에서 좌패널을 살짝 겹친다(z-10). */}
        <div className="mt-7 min-w-0 flex-1 lg:relative lg:z-10 lg:mt-0 lg:-ml-12 lg:flex lg:flex-col lg:justify-center">
          <div className="lg:w-[755px] lg:max-w-full">
          <div className="mb-4 flex items-center justify-end gap-2">
            <ControlButton label="이전 행사 보기" onClick={goPrev}>
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
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </ControlButton>
            <ControlButton label="다음 행사 보기" onClick={goNext}>
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
                <path d="M9 6l6 6-6 6" />
              </svg>
            </ControlButton>
            <ControlButton
              label={playing ? "자동 재생 멈춤" : "자동 재생 시작"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="size-[14px]"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="size-[14px]"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </ControlButton>
          </div>

          {/* 뷰포트: wrapper(lg:755px)를 채운다. overflow-hidden — 스크롤바·네이티브 스크롤 없음 */}
          <div ref={viewportRef} className="overflow-hidden">
            <ul
              className="flex transition-transform duration-500 ease-out"
              style={{
                gap: `${GAP}px`,
                transform: `translateX(-${index * CARD_STEP}px)`,
              }}
            >
              {visibleEvents.map((event) => (
                <li key={event.title} className="shrink-0">
                  <a
                    href={event.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-[339px] w-[245px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(145,155,185,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {/* 이미지 영역(245x139). 더미라 카테고리 placeholder */}
                    <div className="relative h-[139px] shrink-0 bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
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
                      <span className="mt-auto pt-3 text-[13.5px] text-[#555]">
                        {event.date}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
