import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

// 사업 소개. 초안 단계라 문구는 국문으로 하드코딩한다(i18n 보류 — 확정 후 About 네임스페이스로 이전).
// 홈 섹션과 동일한 레이아웃 토큰(max-w-[1440px]·eyebrow 라벨·카드)을 따른다.
// 값 카드 항목은 VALUES 배열에서만 관리한다. (구조 유연성 우선)

export const metadata: Metadata = {
  title: "사업 소개 — 공공체육관 예약",
  description:
    "공공 체육시설을 누구나 쉽고 공정하게 이용하도록 연결하는 생활체육 예약 플랫폼을 소개합니다.",
};

type Value = {
  title: string;
  desc: string;
  icon: ReactNode;
};

const VALUES: Value[] = [
  {
    title: "접근성",
    desc: "지역·종목으로 가까운 공공 체육시설을 한눈에 찾고, 빈 시간대를 바로 예약합니다.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
  },
  {
    title: "공정성",
    desc: "동일한 규칙과 선착순으로 누구에게나 같은 예약 기회를 제공합니다.",
    icon: (
      <>
        <path d="M12 3v18M5 7h14M7 7l-3 7a4 4 0 0 0 6 0L7 7Zm10 0-3 7a4 4 0 0 0 6 0l-3-7Z" />
      </>
    ),
  },
  {
    title: "신뢰성",
    desc: "운영시간·이용료·잔여 시간대를 투명하게 안내해 헛걸음을 줄입니다.",
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
];

const STATS: { value: string; label: string }[] = [
  { value: "공공", label: "운영 주체 공공 체육시설" },
  { value: "4개 언어", label: "한국어·English·日本語·中文" },
  { value: "실시간", label: "잔여 시간대 확인·예약" },
];

export default function AboutPage() {
  return (
    <main className="bg-background text-foreground">
      {/* 인트로 */}
      <section className="border-b border-line bg-surface-2/60">
        <div className="mx-auto w-full max-w-[1440px] px-5 py-[64px] sm:px-8">
          <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
            ABOUT
          </p>
          <h1 className="mt-2 max-w-2xl text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-slate-950 sm:text-[38px]">
            동네 가까운 곳에서 시작하는 생활체육
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
            공공체육관 예약은 집 근처 공공 체육시설을 누구나 쉽고 공정하게 이용할
            수 있도록 연결하는 생활체육 예약 플랫폼입니다. 흩어져 있던 시설 정보와
            빈 시간대를 한 흐름에서 확인하고, 원하는 시간을 바로 예약하세요.
          </p>
        </div>
      </section>

      {/* 핵심 가치 */}
      <section className="py-[56px]">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-slate-950">
            우리가 지키는 세 가지
          </h2>
          <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((value) => (
              <li key={value.title}>
                <div className="flex h-full flex-col rounded-xl border border-line bg-white px-6 py-7">
                  <span className="mb-5 grid size-[52px] place-items-center rounded-[13px] bg-surface-2">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="size-[26px] text-accent-strong"
                    >
                      {value.icon}
                    </svg>
                  </span>
                  <h3 className="text-[18.5px] font-bold text-slate-950">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-6 text-muted">
                    {value.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 숫자로 보는 서비스 */}
      <section className="pb-[56px]">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <dl className="grid gap-5 rounded-2xl border border-line bg-white px-6 py-8 sm:grid-cols-3 sm:px-10">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center sm:text-left">
                <dt className="text-[26px] font-extrabold tracking-[-0.01em] text-accent-strong">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-[14.5px] text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 마무리 CTA */}
      <section className="pb-[72px]">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <div className="flex flex-col gap-4 rounded-2xl bg-accent px-7 py-9 text-accent-ink sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div>
              <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">
                가까운 체육시설부터 둘러보세요
              </h2>
              <p className="mt-1.5 text-[15px] text-accent-ink/80">
                지역·종목을 고르면 바로 예약할 수 있는 시설을 보여드립니다.
              </p>
            </div>
            <Link
              href="/gyms"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-white px-6 text-[15px] font-bold text-accent-strong transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent"
            >
              시설 찾기
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-subtle">
            ※ 본 화면은 디자인 프리뷰이며, 표시되는 정보·연락처는 실제 정보가
            아닙니다.
          </p>
        </div>
      </section>
    </main>
  );
}
