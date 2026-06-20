"use client";

import { useRef } from "react";

// 홈 "전국 스포츠 행사·대회" 가로 슬라이드. 우리가 주최하는 게 아니라 외부 대회·행사
// 정보를 큐레이션해 보여주는 영역이라, 각 카드는 외부 링크(새 탭)로 연결한다.
// 현재는 데모 더미 데이터이며, 실제 운영 시 링크/이미지를 채운다(href는 추후 교체).
// 좌우 화살표로 가로 스크롤하고(overflow-x + scroll-snap), 모바일은 스와이프로 대체한다.
type EventPost = {
  category: string;
  title: string;
  period: string;
  fee: "무료" | "유료";
  href: string;
};

const EVENTS: EventPost[] = [
  {
    category: "마라톤",
    title: "2026 서울하프마라톤 참가자 모집",
    period: "접수 2026.06.01 ~ 2026.07.15",
    fee: "유료",
    href: "#",
  },
  {
    category: "생활체육",
    title: "제12회 구민 생활체육 대축전",
    period: "접수 2026.06.10 ~ 2026.07.05",
    fee: "무료",
    href: "#",
  },
  {
    category: "배드민턴",
    title: "전국 동호인 배드민턴 오픈 대회",
    period: "접수 2026.06.15 ~ 2026.07.20",
    fee: "유료",
    href: "#",
  },
  {
    category: "농구",
    title: "여름 3x3 길거리 농구 리그",
    period: "접수 2026.06.20 ~ 2026.07.10",
    fee: "무료",
    href: "#",
  },
  {
    category: "풋살",
    title: "주말 풋살 클럽 매치 시즌2",
    period: "접수 2026.06.05 ~ 2026.07.31",
    fee: "유료",
    href: "#",
  },
  {
    category: "탁구",
    title: "지역 탁구 동호회 친선 토너먼트",
    period: "접수 2026.06.18 ~ 2026.07.18",
    fee: "무료",
    href: "#",
  },
];

const FEE_BADGE = {
  무료: "bg-accent text-accent-ink",
  유료: "bg-warning text-white",
} as const;

const ARROW_BTN_CLASS =
  "grid size-11 place-items-center rounded-full border border-line-strong bg-white text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function HomeEvents() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCards = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  };

  return (
    <section className="py-[56px]">
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mb-[26px] flex items-end justify-between gap-4">
          <div>
            <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
              EVENTS
            </p>
            <h2 className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-slate-950">
              전국 스포츠 행사·대회
            </h2>
            <p className="mt-[9px] text-[16.5px] text-muted">
              지금 접수 중인 마라톤·생활체육 대회 소식을 모았어요.
            </p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              aria-label="이전 행사 보기"
              className={ARROW_BTN_CLASS}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-5"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              aria-label="다음 행사 보기"
              className={ARROW_BTN_CLASS}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-5"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2"
        >
          {EVENTS.map((event) => (
            <a
              key={event.title}
              href={event.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:border-line-strong hover:shadow-[0_4px_16px_rgba(15,23,42,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-[300px]"
            >
              <div className="relative h-[150px] bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <span className="rounded-full bg-success px-2.5 py-1 text-[12px] font-bold text-white">
                    접수중
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${FEE_BADGE[event.fee]}`}
                  >
                    {event.fee}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center text-[15px] font-bold text-accent-strong/30"
                >
                  {event.category}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-[18px]">
                <p className="text-[12.5px] font-bold text-accent-strong">
                  {event.category}
                </p>
                <h3 className="mt-1.5 line-clamp-2 text-[16.5px] font-bold leading-snug text-slate-950 transition group-hover:text-accent-strong">
                  {event.title}
                </h3>
                <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-muted">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="size-4 shrink-0 text-subtle"
                  >
                    <rect x="3" y="4.5" width="18" height="17" rx="2" />
                    <path d="M3 9h18M8 3v4M16 3v4" />
                  </svg>
                  {event.period}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
