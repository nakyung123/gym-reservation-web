"use client";

import { useEffect, useRef, useState } from "react";

// 홈 "전국 스포츠 행사·대회" 영역 — KMI(한국의학연구소) 메인 'KMI 소식' 섹션을 실측값 그대로 1:1 재현.
// 우리 페이지에 맞춘 것은 컬러뿐, 크기·간격·구성은 KMI 실측값을 그대로 쓴다.
// KMI 실측(데스크톱 1440):
//  - 좌패널 .news-left: width 576, padding 100, radius 0/40/40/0, 화면 왼쪽 끝 flush
//  - 탭 li: height 68, padding 0 12, border-bottom 1px rgba(255,255,255,.28), space-between
//    활성=흰글씨+흰원28px(우화살표) / 비활성=흰60%
//  - 카드: 245x339, radius20 / 이미지영역 245x139(상단) / 본문 245x200 padding 20·24
//    배지 #d3e1fb·radius25·padding5·10·14/500 / 제목 22/600 line33 #1d1d1d / 날짜 14 #555
//  - 캐러셀: transform 이동(네이티브 스크롤 없음), 3개씩(755=245*3+10*2), 끝에서 무한 순환
//  - 섹션 배경: 투명(KMI 동일). 우리 페이지색 #f8fafc 위에 흰 카드가 그림자로 분리된다.
// 컨트롤은 사용자 요청대로 3개 모두 60px 흰원으로 통일하고, hover 시 대표색(네이비)로 채운다.
// 좌패널 배경만 사진 대신 브랜드 네이비 그라데이션. 데스크톱 레이아웃은 xl(>=1280)에서 적용.

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

const CARD_W = 245;
const GAP = 10;
const CARD_STEP = CARD_W + GAP; // 255
const AUTOPLAY_MS = 4000;

// 컨트롤 버튼(3개 공통): 60px 흰원, hover 시 대표색(네이비) 채움.
const CTRL_CLASS =
  "grid size-[60px] place-items-center rounded-full border border-[#d8d8d8] bg-white text-[#1d1d1d] transition hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

// 뷰포트에 들어가는 카드 수(데스크톱 755 → 3). 핸들러/인터벌에서만 호출.
function perViewOf(viewport: HTMLElement | null): number {
  const w = viewport?.clientWidth ?? CARD_STEP * 3 - GAP;
  return Math.max(1, Math.floor((w + GAP) / CARD_STEP));
}

export function HomeEvents() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<EventCategory>("대회");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const visibleEvents = EVENTS.filter((event) => event.category === activeTab);
  const maxIndex = () =>
    Math.max(0, visibleEvents.length - perViewOf(viewportRef.current));

  // 끝에 닿으면 멈추지 않고 무한 순환한다.
  const goNext = () => setIndex((i) => (i >= maxIndex() ? 0 : i + 1));
  const goPrev = () => setIndex((i) => (i <= 0 ? maxIndex() : i - 1));

  const handleTab = (tab: EventCategory) => {
    setActiveTab(tab);
    setIndex(0);
  };

  // 자동 재생: 끝에서 처음으로 루프. setState는 인터벌 콜백에서만 호출.
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
      <div className="flex flex-col px-5 sm:px-8 xl:flex-row xl:items-stretch xl:px-0">
        {/* 좌측 네이비 패널 (xl에서 화면 왼쪽 끝 flush, 576px, padding 100) */}
        <div className="relative shrink-0 rounded-2xl bg-[linear-gradient(150deg,#1f3c8c_0%,#15235c_100%)] px-8 py-10 text-white sm:px-10 sm:py-12 xl:w-[576px] xl:rounded-l-none xl:rounded-r-[40px] xl:p-[100px]">
          <p className="text-[18px] font-semibold text-white/90">행사 소식</p>
          <h2 className="mt-3 text-[27px] font-semibold leading-[1.35] tracking-[-0.01em] sm:text-[34px]">
            전국의 스포츠
            <br className="hidden sm:block" /> <span className="text-[#9db4ff]">행사·대회 소식</span>을
            <br className="hidden xl:block" /> 알려드립니다.
          </h2>

          <ul
            role="tablist"
            aria-label="행사 카테고리"
            className="mt-7 flex gap-1 overflow-x-auto xl:mt-12 xl:flex-col xl:gap-0 xl:overflow-visible"
          >
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
                      active
                        ? "bg-white/15 text-white xl:bg-transparent"
                        : "text-white/60 hover:text-white/90"
                    }`}
                  >
                    <span>{tab}</span>
                    {/* 활성 탭: 흰 원(28px) + 우화살표 */}
                    <span
                      aria-hidden="true"
                      className={`hidden size-7 shrink-0 place-items-center rounded-full bg-white text-accent-strong transition-opacity xl:grid ${
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
                        className="size-[14px]"
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

        {/* 우측: 컨트롤 + 카드 캐러셀. xl에서 좌패널을 46px 겹친다(z-10). */}
        <div className="mt-7 min-w-0 flex-1 xl:relative xl:z-10 xl:mt-0 xl:-ml-[46px] xl:flex xl:flex-col xl:justify-center">
          <div className="xl:w-[755px] xl:max-w-full">
            {/* 컨트롤: 3개 모두 60px 흰원, hover 대표색 채움 */}
            <div className="mb-5 flex items-center justify-end gap-2.5">
              <button type="button" onClick={goPrev} aria-label="이전 행사 보기" className={CTRL_CLASS}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" onClick={goNext} aria-label="다음 행사 보기" className={CTRL_CLASS}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "자동 재생 멈춤" : "자동 재생 시작"}
                className={CTRL_CLASS}
              >
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

            {/* 뷰포트: overflow-hidden — 스크롤바·네이티브 스크롤 없음. transform으로만 이동 */}
            <div ref={viewportRef} className="overflow-hidden">
              <ul
                className="flex transition-transform duration-500 ease-out"
                style={{ gap: `${GAP}px`, transform: `translateX(-${index * CARD_STEP}px)` }}
              >
                {visibleEvents.map((event) => (
                  <li key={event.title} className="shrink-0">
                    <a
                      href={event.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex h-[339px] w-[245px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(145,155,185,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {/* 이미지 영역(245x139). 실제 행사 이미지가 없어 브랜드 색 placeholder */}
                      <div className="relative h-[139px] shrink-0 bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 grid place-items-center text-[15px] font-bold text-accent-strong/25"
                        >
                          {event.category}
                        </span>
                      </div>

                      {/* 본문 245x200, padding 20·24 */}
                      <div className="flex flex-1 flex-col px-6 py-5">
                        <span className="w-fit rounded-[25px] bg-[#d3e1fb] px-2.5 py-[5px] text-[14px] font-medium text-[#1d1d1d]">
                          {event.category}
                        </span>
                        <p className="mt-3 line-clamp-2 text-[22px] font-semibold leading-[33px] text-[#1d1d1d]">
                          {event.title}
                        </p>
                        <span className="mt-auto text-[14px] text-[#555]">{event.date}</span>
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
