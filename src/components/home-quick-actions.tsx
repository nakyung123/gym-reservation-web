import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

/**
 * 홈 예약 흐름 가이드 카드. 클릭 동작이 없는 안내용(가이드)이라 Link가 아닌 정적 div로 둔다.
 * 그림자·hover 전환 없이 평면 카드로, 흐름(시설 찾기 → 예약하기 → 예약 조회 → 마이페이지)만
 * 보여준다. 실제 진입은 상단 검색바·시설 찾기로 한다. 항목은 QUICK_ACTIONS 배열에서만 관리한다.
 */
type QuickAction = {
  titleKey: string;
  descKey: string;
  icon: ReactNode;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    titleKey: "quickFindTitle",
    descKey: "quickFindDesc",
    icon: (
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01" />
    ),
  },
  {
    titleKey: "quickBookTitle",
    descKey: "quickBookDesc",
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4M9 14l2 2 4-4" />
      </>
    ),
  },
  {
    titleKey: "quickLookupTitle",
    descKey: "quickLookupDesc",
    icon: (
      <>
        <path d="M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1Z" />
        <path d="M9 12h6M9 16h4" />
      </>
    ),
  },
  {
    titleKey: "quickMypageTitle",
    descKey: "quickMypageDesc",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
      </>
    ),
  },
];

export async function HomeQuickActions() {
  const t = await getTranslations("Home");
  return (
    <div className="mx-auto mt-[22px] w-full max-w-[1440px] px-5 sm:px-8">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.titleKey}>
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
                  {action.icon}
                </svg>
              </span>
              <h3 className="text-[18.5px] font-bold text-slate-950">
                {t(action.titleKey)}
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-muted">
                {t(action.descKey)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
