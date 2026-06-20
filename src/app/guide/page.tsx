import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

// 이용 안내 = 처음 온 사용자를 위한 '이용 방법' 5단계 안내.
// 기존에 이 라우트에 있던 FAQ 아코디언은 /faq(문의·FAQ)로 이전했다.
// 단계는 가로 scroll-snap 슬라이드로 보여준다(HomeEvents와 동일 패턴). JS 없이 CSS만 쓰므로
// 서버 컴포넌트로 두고, 모바일은 스와이프·데스크톱은 스크롤로 넘긴다(창을 줄여도 깨지지 않는다).
// 단계 추가/삭제/순서는 STEPS 배열에서만 관리한다. (구조 유연성 우선)

export const metadata: Metadata = {
  title: "이용 방법 — 공공체육관 예약",
  description: "시설 검색부터 현장 체크인까지, 공공체육관 예약 이용 방법을 단계별로 안내합니다.",
};

type GuideStep = {
  titleKey: string;
  descKey: string;
  icon: ReactNode;
};

// 시설 검색 → 시간대 예약 → 예약 확인 → 방문·체크인 → 이용 완료
const STEPS: GuideStep[] = [
  {
    titleKey: "step1Title",
    descKey: "step1Desc",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
  },
  {
    titleKey: "step2Title",
    descKey: "step2Desc",
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4M9 14l2 2 4-4" />
      </>
    ),
  },
  {
    titleKey: "step3Title",
    descKey: "step3Desc",
    icon: (
      <>
        <path d="M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1Z" />
        <path d="M9 12h6M9 16h4" />
      </>
    ),
  },
  {
    titleKey: "step4Title",
    descKey: "step4Desc",
    icon: (
      <>
        <path d="M3 21h18M5 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M16 9h3a1 1 0 0 1 1 1v11" />
        <path d="M11 12h.01" />
      </>
    ),
  },
  {
    titleKey: "step5Title",
    descKey: "step5Desc",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </>
    ),
  },
];

export default async function GuidePage() {
  const t = await getTranslations("Guide");
  return (
    <main className="bg-background text-foreground">
      <section className="py-[56px]">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <div className="mb-[26px]">
            <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
              GUIDE
            </p>
            <h1 className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-slate-950">
              {t("title")}
            </h1>
            <p className="mt-[9px] text-[16.5px] text-muted">{t("intro")}</p>
          </div>

          <ol className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2">
            {STEPS.map((step, index) => (
              <li
                key={step.titleKey}
                className="flex w-[260px] shrink-0 snap-start flex-col rounded-xl border border-line bg-white p-[22px]"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-[52px] place-items-center rounded-[13px] bg-surface-2">
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
                      {step.icon}
                    </svg>
                  </span>
                  <span
                    className="text-[13px] font-bold tracking-[0.08em] text-subtle"
                    aria-hidden="true"
                  >
                    STEP {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h2 className="mt-5 text-[18.5px] font-bold text-slate-950">
                  {t(step.titleKey)}
                </h2>
                <p className="mt-2 text-[15px] leading-6 text-muted">
                  {t(step.descKey)}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/gyms"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-[15px] font-bold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              시설 찾기
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
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link
              href="/faq"
              className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-[15px] font-bold text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              문의·FAQ 보기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
