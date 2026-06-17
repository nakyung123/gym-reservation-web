import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

/**
 * 홈 퀵액션 카드. 수정 시안대로 검색바 아래에 위치한다(히어로 겹침은 검색바가 가져감).
 * 카드 크기/스타일(px-6 py-7·size-52 아이콘·그림자)은 시안 그대로 유지한다.
 * 항목은 아래 QUICK_ACTIONS 배열에서만 관리한다(추가/삭제/순서/링크 변경).
 *
 * 라우팅: 예약하기는 단독 진입점이 없어 시설 선택(/gyms)으로 보낸다.
 * 예약 조회·마이페이지는 인증 게이트가 있는 라우트라 비로그인 시 로그인으로 유도된다.
 */
type QuickAction = {
  titleKey: string;
  descKey: string;
  href: string;
  icon: ReactNode;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    titleKey: "quickFindTitle",
    descKey: "quickFindDesc",
    href: "/gyms",
    icon: (
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01" />
    ),
  },
  {
    titleKey: "quickBookTitle",
    descKey: "quickBookDesc",
    href: "/gyms",
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
    href: "/reservations",
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
    href: "/mypage",
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
            <Link
              href={action.href}
              className="group flex h-full flex-col rounded-xl border border-line bg-white px-6 py-7 shadow-[0_4px_16px_rgba(15,23,42,0.09)] transition hover:-translate-y-[3px] hover:border-accent hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <span className="mb-5 grid size-[52px] place-items-center rounded-[13px] bg-surface-2 transition group-hover:bg-white/[0.16]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="size-[26px] text-accent-strong transition group-hover:text-white"
                >
                  {action.icon}
                </svg>
              </span>
              <h3 className="flex items-center justify-between text-[18.5px] font-bold text-slate-950 transition group-hover:text-white">
                {t(action.titleKey)}
                <span
                  aria-hidden="true"
                  className="text-subtle transition group-hover:translate-x-0.5 group-hover:text-white"
                >
                  →
                </span>
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-muted transition group-hover:text-white/80">
                {t(action.descKey)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
