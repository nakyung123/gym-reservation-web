"use client";

import Image from "next/image";
import Link from "next/link";
import { type TransitionEvent, useEffect, useRef, useState } from "react";
import { listNotices } from "@/lib/notices";

// 홈 "전국 스포츠 행사·대회" 영역 — KMI 메인 'KMI 소식' 섹션을 실측값 그대로 재현.
// 우리 페이지에 맞춘 건 컬러 + 좌우 여백(검색바·예약흐름과 같은 컨테이너 그리드에 정렬).
//   사이트 표준 컨테이너(max-w-1440 + px-5/px-8) 안에서 좌패널 42% + 우측 카드 flex(3개 노출).
//   → 패널 좌측은 검색바/예약흐름 좌측선과, 카드 우측은 그 우측선과 정렬된다.
// KMI 실측: 패널 padding 100·radius 0/40/40/0 / 탭 h68·구분선 1px흰28%·활성 흰원+우화살표
//   이미지 카드: 245x339(이미지 139 + 본문 200, padding 20·24) / 배지 #d3e1fb·14/500
//     제목 22/600 line33 #1d1d1d / 날짜 14 #555
//   공지사항 카드: 이미지 없이 245x360, 본문 padding 30·20·20 + 자세히보기 푸터
//     (자세히보기 + 52px 화살표원 bg #f8f8f8). hover: 카드 네이비 보더 + 화살표원 네이비 채움.
// 캐러셀: transform 이동(네이티브 스크롤 없음), 끝에서 무한 순환. 컨트롤 3개 60px·hover 대표색.

type EventCategory = "대회" | "공지사항" | "생활체육" | "강좌";

// image: 카드 상단 사진(public/events/{slug}.webp). 없으면 카테고리 그라데이션 placeholder.
type EventPost = { category: EventCategory; title: string; date: string; href: string; image?: string };

const TABS: EventCategory[] = ["대회", "공지사항", "생활체육", "강좌"];

// 공지사항 카드: 공지 SSOT(src/lib/notices.ts)에서 최신 6개를 그대로 가져와
//   각 카드를 해당 게시글(/notice/{id})로 연결한다(공지 추가/삭제가 자동 반영).
const NOTICE_EVENTS: EventPost[] = listNotices()
  .slice(0, 6)
  .map((notice) => ({
    category: "공지사항",
    title: notice.title,
    date: notice.date,
    href: `/notice/${notice.id}`,
  }));

// 대회·생활체육·강좌: 데모 정적 데이터(실제 행사 URL이 정해지면 href에 넣으면 그대로 연결).
//   image: 생성한 사진은 해당 행사에 매칭, 사진이 없는 카드는 같은 카테고리 사진을 돌려 재사용한다.
const STATIC_EVENTS: EventPost[] = [
  { category: "대회", title: "서울하프마라톤 참가자 모집", date: "2026-06-01", href: "#", image: "/events/seoul-half-marathon.webp" },
  { category: "대회", title: "전국 동호인 배드민턴 오픈 대회", date: "2026-06-15", href: "#", image: "/events/badminton-open.webp" },
  { category: "대회", title: "여름 3x3 길거리 농구 리그", date: "2026-06-20", href: "#", image: "/events/street-basketball-3x3.webp" },
  { category: "대회", title: "지역 탁구 동호회 친선 토너먼트", date: "2026-06-18", href: "#", image: "/events/badminton-open.webp" },
  { category: "생활체육", title: "제12회 구민 생활체육 대축전", date: "2026-06-10", href: "#", image: "/events/sports-festival.webp" },
  { category: "생활체육", title: "주말 풋살 클럽 매치 시즌2", date: "2026-06-05", href: "#", image: "/events/futsal-weekend.webp" },
  { category: "생활체육", title: "가족과 함께하는 체육 한마당", date: "2026-06-22", href: "#", image: "/events/family-sports-day.webp" },
  { category: "생활체육", title: "여름 야간 러닝 크루 모집", date: "2026-06-19", href: "#", image: "/events/sports-festival.webp" },
  { category: "생활체육", title: "동네 배드민턴 리그 참가팀 모집", date: "2026-06-16", href: "#", image: "/events/futsal-weekend.webp" },
  { category: "생활체육", title: "구민 탁구 동호회 정기 모임", date: "2026-06-07", href: "#", image: "/events/family-sports-day.webp" },
  { category: "강좌", title: "초보자 수영 교실 (여름학기)", date: "2026-06-12", href: "#", image: "/events/swimming-beginner.webp" },
  { category: "강좌", title: "시니어 건강체조 교실", date: "2026-06-08", href: "#", image: "/events/senior-gymnastics.webp" },
  { category: "강좌", title: "유소년 농구 교실 모집", date: "2026-06-14", href: "#", image: "/events/youth-basketball.webp" },
  { category: "강좌", title: "성인 요가·필라테스 입문 클래스", date: "2026-06-20", href: "#", image: "/events/swimming-beginner.webp" },
  { category: "강좌", title: "주말 가족 배드민턴 교실", date: "2026-06-17", href: "#", image: "/events/senior-gymnastics.webp" },
  { category: "강좌", title: "직장인 저녁 헬스 PT 그룹반", date: "2026-06-06", href: "#", image: "/events/youth-basketball.webp" },
];

const EVENTS: EventPost[] = [...STATIC_EVENTS, ...NOTICE_EVENTS];

const GAP = 20;
const PER_VIEW = 3; // xl 한 화면에 보이는 카드 수(항상 3장)
const AUTOPLAY_MS = 4000;

// 컨트롤 버튼 공통 형태(60px 원).
const CTRL_BASE =
  "grid size-[60px] place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
// 기본: 흰 원, hover 시 대표색(네이비) 채움.
const CTRL_CLASS = `${CTRL_BASE} border-[#d8d8d8] bg-white text-[#1d1d1d] hover:border-accent hover:bg-accent hover:text-white`;
// 멈춤(재생버튼) 상태 강조: 네이비로 채워 정지 상태임을 사용자에게 알린다.
const CTRL_FILLED = `${CTRL_BASE} border-accent bg-accent text-white hover:bg-accent-hover`;

const Arrow = ({ dir }: { dir: 1 | -1 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
    {dir === -1 ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

function EventCard({ event }: { event: EventPost }) {
  const badge = (
    <span className="w-fit rounded-[25px] bg-[#d3e1fb] px-[33px] py-[2px] text-[14px] font-medium text-[#1d1d1d]">
      {event.category}
    </span>
  );

  // 링크: 공지사항은 해당 게시글(/notice/{id})로, 그 외(대회·생활체육·강좌)는 외부 링크(새 탭).
  // event.href가 실제 URL이면 그대로, 아직 placeholder('#')면 데모로 제목 검색 결과에 연결한다(실제 행사 URL로 교체 가능).
  const hasRealHref = !!event.href && event.href !== "#";
  const externalHref = hasRealHref
    ? event.href
    : `https://search.naver.com/search.naver?query=${encodeURIComponent(event.title)}`;

  // 공지사항: 이미지 없이 자세히보기 푸터 카드. 내부 라우트(/notice/{id})라 Next Link로 연결.
  if (event.category === "공지사항") {
    return (
      <Link
        href={event.href}
        className="group flex h-[360px] w-full flex-col rounded-[20px] border border-transparent bg-white px-5 pb-5 pt-[30px] shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:-translate-y-[20px] hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                <path d="M3 12h18M15 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // 그 외(대회·생활체육·강좌): 상단 이미지 + 아래부분이 이미지를 덮는 카드. 외부 링크(새 탭).
  return (
    <a
      href={externalHref}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-[380px] w-full flex-col overflow-hidden rounded-[20px] border border-transparent bg-white shadow-[0_2px_8px_rgba(145,155,185,0.25)] transition duration-300 hover:-translate-y-[20px] hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* 이미지: 330×188 — 사진이 있으면 실사진, 없으면 카테고리 그라데이션 placeholder */}
      <div className="relative h-[188px] shrink-0 bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
        {event.image ? (
          <Image
            src={event.image}
            alt={event.title}
            fill
            quality={90}
            sizes="(max-width: 1280px) 80vw, 330px"
            className="object-cover"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[15px] font-bold text-accent-strong/25">
            {event.category}
          </span>
        )}
      </div>
      {/* 아래부분: 330×200, 위로 8px(-mt-2) 끌어올려 이미지를 덮는다(z-10 + 흰 배경 + rounded-t). */}
      <div className="relative z-10 -mt-5 flex h-[210px] flex-col bg-white px-6 py-5 transition group-hover:bg-accent-tint">
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
  const slidingRef = useRef(false); // 슬라이드 진행 중 잠금(빠른 연타·백그라운드 누적 방지)
  const [activeTab, setActiveTab] = useState<EventCategory>("대회");
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0); // 카드 1칸 이동량(px) = 카드폭 + gap, 측정값
  const [animate, setAnimate] = useState(true); // 클론 점프 시에만 transition을 끈다

  // 활성 탭의 카드들을 날짜 내림차순(최신순)으로 정렬 — 왼쪽부터 가장 최신.
  const visibleEvents = EVENTS.filter(
    (event) => event.category === activeTab,
  ).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const count = visibleEvents.length;
  // 노출 수(3)를 초과할 때만 무한 순환. 3개 이하는 그대로 노출(스크롤 없음).
  const loop = count > PER_VIEW;
  // 무한 순환용 확장 배열: 앞에 마지막 3개·뒤에 처음 3개 클론을 붙여 끊김 없이 돈다.
  const slides = loop
    ? [
        ...visibleEvents.slice(count - PER_VIEW),
        ...visibleEvents,
        ...visibleEvents.slice(0, PER_VIEW),
      ]
    : visibleEvents;
  const baseIndex = loop ? PER_VIEW : 0; // 첫 실제 카드의 위치
  const [index, setIndex] = useState(baseIndex);

  // 카드 폭이 fluid(3개가 폭을 정확히 채움)라 실측해서 step을 잡는다.
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

  // 클론 구간으로 점프(animate=false)한 직후 다음 프레임에 transition을 다시 켠다.
  useEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  // 한 번에 한 칸만 이동하고, 슬라이드(transition) 진행 중에는 무시한다.
  // → 다음 버튼을 빠르게 연타하거나 백그라운드에서 자동재생이 누적돼도 index가 클론 버퍼를 넘지 않아 카드가 비지 않는다.
  const move = (delta: 1 | -1) => {
    if (!loop || slidingRef.current || step === 0) return;
    slidingRef.current = true;
    setAnimate(true);
    setIndex((i) => i + delta);
  };
  const goNext = () => move(1);
  const goPrev = () => move(-1);

  // UL 자신의 transform 전환이 끝났을 때만(카드 hover 전환 버블은 무시) 잠금을 풀고,
  // 클론 구간이면 transition 없이 동일하게 보이는 실제 카드 위치로 정규화한다(끊김 없는 순환 + 누적 방지).
  const handleTransitionEnd = (event: TransitionEvent<HTMLUListElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
      return;
    }
    slidingRef.current = false;
    if (index < baseIndex || index >= baseIndex + count) {
      setAnimate(false);
      setIndex(baseIndex + ((((index - baseIndex) % count) + count) % count));
    }
  };

  const handleTab = (tab: EventCategory) => {
    setActiveTab(tab);
    const nextLoop =
      EVENTS.filter((event) => event.category === tab).length > PER_VIEW;
    slidingRef.current = false;
    setAnimate(false);
    setIndex(nextLoop ? PER_VIEW : 0);
  };

  useEffect(() => {
    if (!playing || !loop) return;
    const timer = window.setInterval(() => {
      if (slidingRef.current) return; // 이전 슬라이드가 끝나기 전이면 건너뜀(누적 방지)
      slidingRef.current = true;
      setAnimate(true);
      setIndex((i) => i + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, activeTab, loop]);

  return (
    <section className="overflow-hidden py-12 xl:py-[90px]">
      {/* 사이트 표준 컨테이너(좌우 여백 일치) 유지. xl에서 패널/우측을 absolute로 배치하되
          기준은 이 컨테이너(grid)라, 내용·컨트롤·카드가 모두 좌우 여백선에 정렬된다. */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-5 sm:px-8 xl:relative xl:block xl:h-[750px]">
        {/* 좌측 네이비 패널(한 몸): xl에서 좌측을 뷰포트 끝(left:50%-50vw)까지 빼고 전체 너비 762px.
            즉 762px = 그리드 넘어 블리드된 부분 + 그리드 안쪽 부분(하나의 박스). 텍스트만 pl(그리드 오프셋)로
            그리드 좌측선에 맞춰 패널과 분리한다 — 텍스트는 블리드 영역까지 따라가지 않는다. */}
        <div className="relative shrink-0 rounded-2xl bg-[linear-gradient(150deg,#1f3c8c_0%,#15235c_100%)] px-8 py-10 text-white sm:px-10 sm:py-12 xl:absolute xl:left-[calc(50%_-_50vw)] xl:top-0 xl:h-[750px] xl:w-[762px] xl:rounded-l-none xl:rounded-r-[40px] xl:py-[72px] xl:pl-[calc((100vw_-_min(100vw,1440px))/2_+_32px)] xl:pr-0">
          <p className="text-[18px] font-semibold text-white/90">행사 소식</p>
          <h2 className="mt-3 text-[27px] font-semibold leading-[1.35] tracking-[-0.01em] sm:text-[34px]">
            전국의 스포츠
            <br className="hidden sm:block" /> <span className="text-[#9db4ff]">행사·대회 소식</span>을
            <br className="hidden xl:block" /> 알려드립니다.
          </h2>

          <ul role="tablist" aria-label="행사 카테고리" className="mt-7 flex gap-1 overflow-x-auto xl:mt-[125px] xl:w-[280px] xl:flex-col xl:gap-0 xl:overflow-visible">
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
                      {/* 우측 공지사항 카드와 동일한 → 아이콘(같은 path). 탭쪽은 살짝 작게(size-3.5). */}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                        <path d="M3 12h18M15 6l6 6-6 6" />
                      </svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 우측: 컨트롤 + 카드 캐러셀. xl에서 절대배치 — 좌측 left-398(330카드 3장이 정확히 들어가도록, 구분선에서 66px),
            우측은 컨테이너 우측 여백선(right-8). justify-end + pb-[90px]로 컨트롤·카드를 함께 내려 카드 하단이 패널 바닥에서 90px. */}
        <div className="mt-7 min-w-0 flex-1 xl:absolute xl:inset-y-0 xl:left-[398px] xl:right-8 xl:z-10 xl:mt-0 xl:flex xl:flex-col xl:justify-end xl:pb-[90px]">
          <div className="mb-10 flex items-center justify-end gap-2.5">
            <button type="button" onClick={goPrev} aria-label="이전 행사 보기" className={CTRL_CLASS}>
              <Arrow dir={-1} />
            </button>
            <button type="button" onClick={goNext} aria-label="다음 행사 보기" className={CTRL_CLASS}>
              <Arrow dir={1} />
            </button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "자동 재생 멈춤" : "자동 재생 시작"} className={playing ? CTRL_CLASS : CTRL_FILLED}>
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

          {/* 뷰포트: overflow-hidden. 카드 폭은 fluid(3개가 폭을 정확히 채움), 클론으로 무한 순환 */}
          <div ref={viewportRef} className="overflow-hidden -mx-4 px-4 -my-8 py-8">
            <ul
              className="flex"
              style={{
                gap: `${GAP}px`,
                transform: `translateX(-${index * step}px)`,
                transition: animate ? "transform 500ms ease-out" : "none",
              }}
              onTransitionEnd={handleTransitionEnd}
            >
              {slides.map((event, i) => (
                <li
                  key={`${event.title}-${i}`}
                  className="shrink-0 grow-0 basis-[80%] sm:basis-[46%] xl:basis-[calc((100%-40px)/3)]"
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
