import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

// 사업 소개 = "왜 만들었는지 / 무엇을 하는지 / 어떻게"를 일러스트로 풀어내는 소개 페이지.
//   문서 나열이 아니라, 섹션마다 듀오톤 일러스트를 배치한 에디토리얼 구성.
//   히어로(코트+위치핀) → 왜(돋보기+흩어진 핀) → 무엇을(3스텝 흐름 아이콘) → 어떻게(원칙 한 줄) → CTA.
// 사진 에셋이 없어 라인/듀오톤 SVG 일러스트로 구성한다(이모지 금지·라인 SVG 규칙).
// 듀오톤 팔레트 = 확정 아이콘 스펙(home-quick-actions와 동일): base #BCC8F2 / accent #2745B3 / deep #1E3A8A.
// 문구는 국문 하드코딩(초안 — 확정 후 About 네임스페이스로 이전). 내용은 STEPS/PRINCIPLES 배열에서 관리.

export const metadata: Metadata = {
  title: "사업 소개 — 서울체육예약",
  description:
    "공공 체육시설을 누구나 쉽고 공정하게 이용하도록 연결하는 생활체육 예약 플랫폼을 소개합니다.",
};

const IC_BASE = "#BCC8F2";
const IC_ACCENT = "#2745B3";
const IC_DEEP = "#1E3A8A";

// 히어로: 동네 코트 + 위치핀("가까운 곳에서 시작하는 생활체육").
function HeroArt() {
  return (
    <svg
      viewBox="0 0 280 230"
      fill="none"
      role="img"
      aria-label="동네 가까운 공공 체육시설을 찾는 모습 일러스트"
      className="w-full max-w-[420px]"
    >
      <ellipse cx="150" cy="128" rx="124" ry="92" fill="#EEF1FB" />
      {/* 코트 카드 */}
      <rect x="58" y="96" width="160" height="100" rx="14" fill="#fff" stroke={IC_BASE} strokeWidth="2.5" />
      <g stroke={IC_BASE} strokeWidth="2.2">
        <rect x="72" y="110" width="132" height="72" rx="4" fill="none" />
        <line x1="138" y1="110" x2="138" y2="182" />
        <circle cx="138" cy="146" r="13" fill="none" />
      </g>
      {/* 활동 figure (셔틀콕) */}
      <path d="M196 150l10-22a5 5 0 0 1 9 0l-10 22Z" fill={IC_ACCENT} opacity="0.9" />
      <circle cx="200.5" cy="151" r="3" fill={IC_DEEP} />
      {/* 위치핀 */}
      <path d="M150 20c-21 0-37 16-37 37 0 26 37 55 37 55s37-29 37-55c0-21-16-37-37-37Z" fill={IC_ACCENT} />
      <circle cx="150" cy="57" r="15" fill="#fff" />
      <path d="M3 21h18M5 21V7l7-4 7 4v14" transform="translate(138 45) scale(0.5)" stroke={IC_DEEP} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* 보조 점 */}
      <circle cx="46" cy="70" r="6" fill={IC_BASE} />
      <circle cx="236" cy="92" r="8" fill={IC_BASE} />
    </svg>
  );
}

// 왜: 돋보기 + 흩어진 핀("정보가 흩어져 찾기 어렵다 → 한곳으로 모은다").
function ProblemArt() {
  return (
    <svg
      viewBox="0 0 280 230"
      fill="none"
      role="img"
      aria-label="흩어진 시설 정보를 돋보기로 모아 보는 일러스트"
      className="w-full max-w-[400px]"
    >
      <ellipse cx="140" cy="120" rx="126" ry="96" fill="#EEF1FB" />
      {/* 흩어진 핀들(연한) */}
      <g fill={IC_BASE}>
        <path d="M58 56c-9 0-16 7-16 16 0 11 16 24 16 24s16-13 16-24c0-9-7-16-16-16Z" />
        <path d="M222 64c-8 0-14 6-14 14 0 10 14 21 14 21s14-11 14-21c0-8-6-14-14-14Z" />
        <path d="M210 158c-8 0-14 6-14 14 0 10 14 20 14 20s14-10 14-20c0-8-6-14-14-14Z" />
        <path d="M60 168c-7 0-13 5-13 13 0 9 13 18 13 18s13-9 13-18c0-8-6-13-13-13Z" />
      </g>
      {/* 점선 연결(끊긴 정보) */}
      <path d="M70 78 Q140 40 214 80" stroke={IC_BASE} strokeWidth="2.5" strokeDasharray="3 9" strokeLinecap="round" />
      {/* 돋보기 + 초점 안의 강조 핀 */}
      <circle cx="140" cy="120" r="48" fill="#fff" stroke={IC_ACCENT} strokeWidth="5" />
      <path d="M140 96c-13 0-23 10-23 23 0 16 23 33 23 33s23-17 23-33c0-13-10-23-23-23Z" fill={IC_ACCENT} />
      <circle cx="140" cy="119" r="9" fill="#fff" />
      <line x1="176" y1="156" x2="206" y2="186" stroke={IC_ACCENT} strokeWidth="9" strokeLinecap="round" />
      <line x1="176" y1="156" x2="206" y2="186" stroke={IC_DEEP} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

// 무엇을: 3스텝 듀오톤 아이콘(home-quick-actions 확정 아이콘과 동일 언어).
type Step = { no: string; title: string; desc: string; icon: ReactNode };
const STEPS: Step[] = [
  {
    no: "01",
    title: "찾기",
    desc: "지역·종목으로 가까운 공공 체육시설을 한눈에 찾습니다.",
    icon: (
      <>
        <rect x="5" y="9.5" width="24" height="17" rx="2" fill={IC_BASE} />
        <g stroke="#fff" strokeWidth={1.3} fill="none" strokeLinecap="round">
          <rect x="7.3" y="11.8" width="19.4" height="12.4" rx="0.5" />
          <line x1="17" y1="11.8" x2="17" y2="24.2" strokeWidth={1.9} />
          <line x1="11.6" y1="11.8" x2="11.6" y2="24.2" />
          <line x1="22.4" y1="11.8" x2="22.4" y2="24.2" />
        </g>
        <circle cx="30" cy="30" r="8" fill={IC_DEEP} />
        <circle cx="28.7" cy="28.7" r="2.5" fill="none" stroke="#fff" strokeWidth={1.6} />
        <line x1="30.6" y1="30.6" x2="32.7" y2="32.7" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
      </>
    ),
  },
  {
    no: "02",
    title: "예약",
    desc: "비어 있는 시간대를 확인하고 원하는 시간을 바로 예약합니다.",
    icon: (
      <>
        <rect x="5" y="8" width="24" height="23" rx="3" fill={IC_BASE} />
        <path d="M5 11 a3 3 0 0 1 3-3 h18 a3 3 0 0 1 3 3 v3 H5 Z" fill={IC_ACCENT} />
        <rect x="9.6" y="5" width="2.4" height="6" rx="1.2" fill={IC_ACCENT} />
        <rect x="22" y="5" width="2.4" height="6" rx="1.2" fill={IC_ACCENT} />
        <rect x="9" y="18" width="3" height="3" rx="0.8" fill="#fff" />
        <rect x="15.5" y="18" width="3" height="3" rx="0.8" fill="#fff" />
        <circle cx="30" cy="30" r="8" fill={IC_DEEP} />
        <path d="M26.4 30 l2.3 2.3 l4-4.4" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    no: "03",
    title: "조회·관리",
    desc: "내 예약을 한곳에서 확인하고, 필요하면 취소까지 끝냅니다.",
    icon: (
      <>
        <rect x="7" y="5" width="20" height="28" rx="2.5" fill={IC_BASE} />
        <rect x="10.5" y="10" width="13" height="2.4" rx="1.2" fill="#fff" />
        <rect x="10.5" y="15" width="13" height="2.4" rx="1.2" fill="#fff" />
        <rect x="10.5" y="20" width="8" height="2.4" rx="1.2" fill="#fff" />
        <circle cx="30" cy="30" r="8" fill={IC_DEEP} />
        <circle cx="30" cy="30" r="4.3" fill="none" stroke="#fff" strokeWidth={1.5} />
        <path d="M30 27.5 V30 l1.8 1.1" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

// 어떻게: 원칙 한 줄(박스 카드 아님, 라인 아이콘 + 한 문장).
type Principle = { title: string; desc: string; icon: ReactNode };
const PRINCIPLES: Principle[] = [
  {
    title: "공정",
    desc: "같은 규칙과 선착순으로 누구에게나 같은 예약 기회를.",
    icon: <path d="M12 3v18M5 7h14M7 7l-3 7a4 4 0 0 0 6 0L7 7Zm10 0-3 7a4 4 0 0 0 6 0l-3-7Z" />,
  },
  {
    title: "투명",
    desc: "운영시간·이용료·잔여 시간대를 숨김없이 안내합니다.",
    icon: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "접근",
    desc: "한국어·English·日本語·中文, 누구나 막힘없이 이용하도록.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9Z" />
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12">
        {/* breadcrumb */}
        <nav aria-label="breadcrumb" className="text-[13px] text-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition hover:text-accent-strong">
                홈
              </Link>
            </li>
            <li aria-hidden="true" className="text-line-strong">
              /
            </li>
            <li className="font-semibold text-foreground">사업 소개</li>
          </ol>
        </nav>

        {/* 히어로: 좌 카피 + 우 일러스트(부드러운 톤) */}
        <section className="mt-4 grid items-center gap-8 overflow-hidden rounded-[28px] bg-surface-2/70 px-7 py-12 sm:px-12 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
          <div>
            <p className="text-[13px] font-bold tracking-[0.08em] text-accent-strong">
              ABOUT
            </p>
            <h1 className="mt-3 text-[30px] font-extrabold leading-[1.25] tracking-[-0.02em] text-slate-950 sm:text-[40px]">
              동네 가까운 곳에서
              <br />
              시작하는 생활체육
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
              서울체육예약은 집 근처 공공 체육시설을 누구나 쉽고 공정하게
              이용하도록 연결하는 생활체육 예약 플랫폼입니다.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroArt />
          </div>
        </section>

        {/* 왜 만들었나: 좌 일러스트 + 우 글 */}
        <section className="mt-16 grid items-center gap-10 sm:mt-24 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1 lg:justify-start">
            <ProblemArt />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-[13px] font-bold tracking-[0.08em] text-accent-strong">
              WHY
            </p>
            <h2 className="mt-2 text-[24px] font-extrabold tracking-[-0.02em] text-slate-950 sm:text-[28px]">
              왜 만들었나
            </h2>
            <div className="mt-5 space-y-4 text-[16px] leading-[1.8] text-muted">
              <p>
                공공 체육시설은 동네마다 있지만, 정보는 곳곳에 흩어져 있습니다.
                어디에 어떤 시설이 있는지, 운영시간은 언제인지, 지금 빈 시간대가
                있는지 한눈에 알기 어렵습니다.
              </p>
              <p>
                그래서 발품을 팔다 헛걸음하거나, 알아보는 일 자체가 번거로워
                운동을 미루게 됩니다.{" "}
                <span className="font-semibold text-foreground">
                  “집 근처에서 가볍게 운동하고 싶을 뿐인데”
                </span>{" "}
                라는 마음에서 이 서비스가 출발했습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 무엇을 하나: 3스텝 흐름 */}
        <section className="mt-16 sm:mt-24">
          <p className="text-[13px] font-bold tracking-[0.08em] text-accent-strong">
            WHAT
          </p>
          <h2 className="mt-2 text-[24px] font-extrabold tracking-[-0.02em] text-slate-950 sm:text-[28px]">
            무엇을 하나
          </h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
            흩어져 있던 시설 정보와 빈 시간대를 한곳에 모아, 찾고 예약하고
            관리하는 일을 하나의 흐름으로 잇습니다.
          </p>

          <ol className="mt-9 grid gap-5 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.no}
                className="relative flex h-full flex-col rounded-2xl border border-line bg-white px-6 py-7"
              >
                <div className="flex items-center justify-between">
                  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="size-14">
                    {step.icon}
                  </svg>
                  <span className="text-[15px] font-extrabold tracking-[0.04em] text-accent-tint">
                    {step.no}
                  </span>
                </div>
                <h3 className="mt-5 text-[18.5px] font-bold text-slate-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-muted">
                  {step.desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 어떻게: 원칙 한 줄(라인 아이콘 + 문장, 박스 카드 아님) */}
        <section className="mt-16 sm:mt-24">
          <p className="text-[13px] font-bold tracking-[0.08em] text-accent-strong">
            HOW
          </p>
          <h2 className="mt-2 text-[24px] font-extrabold tracking-[-0.02em] text-slate-950 sm:text-[28px]">
            어떻게
          </h2>
          <ul className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className="flex gap-4">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mt-0.5 size-7 shrink-0 text-accent-strong"
                >
                  {p.icon}
                </svg>
                <div>
                  <h3 className="text-[17px] font-bold text-slate-950">
                    {p.title}
                  </h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
                    {p.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA(조용히) */}
        <section className="mt-16 sm:mt-24">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-accent/15 bg-accent-tint/60 px-7 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-slate-950">
                가까운 체육시설부터 둘러보세요
              </h2>
              <p className="mt-1.5 text-[15px] text-muted">
                지역·종목을 고르면 바로 예약할 수 있는 시설을 보여드립니다.
              </p>
            </div>
            <Link
              href="/gyms"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-accent px-6 text-[15px] font-bold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              시설 찾기
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-subtle">
            ※ 본 화면은 디자인 프리뷰이며, 표시되는 정보·연락처는 실제 정보가
            아닙니다.
          </p>
        </section>
      </div>
    </main>
  );
}
