"use client";

import { useEffect, useRef, useState } from "react";

// 홈 "전국 스포츠 행사·대회" 영역 — KMI 메인 'KMI 소식' 섹션을 실측값 그대로 재현.
// 우리 페이지에 맞춘 건 컬러뿐. 좌측 끝~우측 거터까지 폭을 꽉 채우도록 fluid 레이아웃:
//   좌패널 42%(화면 왼쪽 끝 flush) + 우측 카드가 flex로 남은 폭을 채운다(3개 노출).
// KMI 실측: 패널 padding 100·radius 0/40/40/0 / 탭 h68·구분선 1px흰28%·활성 흰원+우화살표
//   이미지 카드: 245x339(이미지 139 + 본문 200, padding 20·24) / 배지 #d3e1fb·14/500
//     제목 22/600 line33 #1d1d1d / 날짜 14 #555
//   공지사항 카드: 이미지 없이 245x360, 본문 padding 30·20·20 + 자세히보기 푸터
//     (자세히보기 + 52px 화살표원 bg #f8f8f8). hover: 카드 네이비 보더 + 화살표원 네이비 채움.
// 캐러셀: transform 이동(네이티브 스크롤 없음), 끝에서 무한 순환. 컨트롤 3개 60px·hover 대표색.

type EventCategory = "대회" | "공지사항" | "생활체육" | "강좌";

type EventPost = { category: EventCategory; title: string; date: string; href: string };

const TABS: EventCategory[] = ["대회", "공지사항", "생활체육", "강좌"];

const EVENTS: EventPost[] = [
  { category: "대회", title: "서울하프마라톤 참가자 모집", date: "2026-06-01", href: "#" },
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

const GAP = 10;
const AUTOPLAY_MS = 4000;

// 컨트롤 버튼(3개 공통): 60px 흰원, hover 시 대표색(네이비) 채움.
const CTRL_CLASS =
  "grid size-[60px] place-items-center rounded-full border border-[#d8d8d8] bg-white text-[#1d1d1d] transition hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const Arrow = ({ dir }: { dir: 1 | -1 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
    {dir === -1 ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

function EventCard({ event }: { event: EventPost }) {
  const badge = (
    <span className="w-fit rounded-[25px] bg-[#d3e1fb] px-2.5 py-[5px] text-[14px] font-medium text-[#1d1d1d]">
      {event.category}
    </span>
  );

  // 공지사항: 이미지 없이 자세히보기 푸터 카드
  if (event.category === "공지사항") {
    return (
      <a
        href={event.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex h-[360px] w-full flex-col rounded-[20px] border border-transparent bg-white px-5 pb-5 pt-[30px] shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {badge}
        <p className="mt-4 line-clamp-2 text-[22px] font-semibold leading-[33px] text-[#1d1d1d]">
          {event.title}
        </p>
        <div className="mt-auto">
          <span className="mb-4 block text-[14px] text-[#555]">{event.date}</span>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-[15px] text-[#1d1d1d]">자세히보기</span>
            <span
              aria-hidden="true"
              className="grid size-[52px] place-items-center rounded-full bg-[#f8f8f8] text-[#1d1d1d] transition group-hover:bg-accent group-hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </div>
      </a>
    );
  }

  // 그 외(대회·생활체육·강좌): 상단 이미지 카드
  return (
    <a
      href={event.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-[339px] w-full flex-col overflow-hidden rounded-[20px] border border-transparent bg-white shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-[0_14px_30px_rgba(145,155,185,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative h-[139px] shrink-0 bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[15px] font-bold text-accent-strong/25">
          {event.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-6 py-5">
        {badge}
        <p className="mt-3 line-clamp-2 text-[22px] font-semibold leading-[33px] text-[#1d1d1d]">
          {event.title}
        </p>
        <span className="mt-auto text-[14px] text-[#555]">{event.date}</span>
      </div>
    </a>
  );
}

export function HomeEvents() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<EventCategory>("대회");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0); // 카드 1칸 이동량(px) = 카드폭 + gap, 측정값

  const visibleEvents = EVENTS.filter((event) => event.category === activeTab);

  // 카드 폭이 fluid라 실측해서 step을 잡는다(ResizeObserver는 observe 시 1회 + resize마다 콜백).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      const card = vp.querySelector("li");
      if (card) setStep((card as HTMLElement).offsetWidth + GAP);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const perView = () => {
    const vp = viewportRef.current;
    if (!vp || step === 0) return 1;
    return Math.max(1, Math.round(vp.clientWidth / step));
  };
  const maxIndex = () => Math.max(0, visibleEvents.length - perView());

  // 끝에 닿으면 멈추지 않고 무한 순환.
  const goNext = () => setIndex((i) => (i >= maxIndex() ? 0 : i + 1));
  const goPrev = () => setIndex((i) => (i <= 0 ? maxIndex() : i - 1));

  const handleTab = (tab: EventCategory) => {
    setActiveTab(tab);
    setIndex(0);
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i >= maxIndex() ? 0 : i + 1));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeTab]);

  return (
    <section className="overflow-hidden py-12 xl:py-[90px]">
      {/* 우측 거터(pr)만 두고 좌패널은 화면 왼쪽 끝까지 bleed */}
      <div className="flex flex-col px-5 sm:px-8 xl:flex-row xl:items-stretch xl:pl-0 xl:pr-8">
        {/* 좌측 네이비 패널 (xl에서 42%, 화면 왼쪽 끝 flush, padding 100) */}
        <div className="relative shrink-0 rounded-2xl bg-[linear-gradient(150deg,#1f3c8c_0%,#15235c_100%)] px-8 py-10 text-white sm:px-10 sm:py-12 xl:w-[42%] xl:rounded-l-none xl:rounded-r-[40px] xl:p-[100px]">
          <p className="text-[18px] font-semibold text-white/90">행사 소식</p>
          <h2 className="mt-3 text-[27px] font-semibold leading-[1.35] tracking-[-0.01em] sm:text-[34px]">
            전국의 스포츠
            <br className="hidden sm:block" /> <span className="text-[#9db4ff]">행사·대회 소식</span>을
            <br className="hidden xl:block" /> 알려드립니다.
          </h2>

          <ul role="tablist" aria-label="행사 카테고리" className="mt-7 flex gap-1 overflow-x-auto xl:mt-12 xl:flex-col xl:gap-0 xl:overflow-visible">
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <li key={tab} className="shrink-0 xl:border-b xl:border-white/[0.28]">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTab(tab)}
                    className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 py-2.5 text-[16px] font-semibold transition xl:h-[68px] xl:w-full xl:rounded-none xl:px-3 xl:py-0 xl:text-[22px] ${
                      active ? "bg-white/15 text-white xl:bg-transparent" : "text-white/60 hover:text-white/90"
                    }`}
                  >
                    <span>{tab}</span>
                    <span
                      aria-hidden="true"
                      className={`hidden size-7 shrink-0 place-items-center rounded-full bg-white text-accent-strong transition-opacity xl:grid ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="size-[14px]">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 우측: 컨트롤 + 카드 캐러셀. xl에서 좌패널을 46px 겹치고 남은 폭을 채운다(flex-1). */}
        <div className="mt-7 min-w-0 flex-1 xl:relative xl:z-10 xl:mt-0 xl:-ml-[46px] xl:flex xl:flex-col xl:justify-center">
          <div className="mb-5 flex items-center justify-end gap-2.5">
            <button type="button" onClick={goPrev} aria-label="이전 행사 보기" className={CTRL_CLASS}>
              <Arrow dir={-1} />
            </button>
            <button type="button" onClick={goNext} aria-label="다음 행사 보기" className={CTRL_CLASS}>
              <Arrow dir={1} />
            </button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "자동 재생 멈춤" : "자동 재생 시작"} className={CTRL_CLASS}>
              {playing ? (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[15px]">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[15px]">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* 뷰포트: overflow-hidden. 카드 폭은 fluid(3개가 폭을 정확히 채움) */}
          <div ref={viewportRef} className="overflow-hidden">
            <ul
              className="flex transition-transform duration-500 ease-out"
              style={{ gap: `${GAP}px`, transform: `translateX(-${index * step}px)` }}
            >
              {visibleEvents.map((event) => (
                <li
                  key={event.title}
                  className="shrink-0 grow-0 basis-[80%] sm:basis-[46%] xl:basis-[calc((100%-20px)/3)]"
                >
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
