import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

/**
 * 홈 예약 흐름 가이드 카드. 클릭 동작이 없는 안내용(가이드)이라 Link가 아닌 정적 div로 둔다.
 * 그림자·hover 전환 없이 평면 카드로, 흐름(시설 찾기 → 예약하기 → 예약 조회 → 마이페이지)만
 * 보여준다. 실제 진입은 상단 검색바·시설 찾기로 한다. 항목은 QUICK_ACTIONS 배열에서만 관리한다.
 *
 * 아이콘 = 확정 시안 "예약 흐름 아이콘 v3.3"의 네이비 듀오톤.
 * 한 색(accent-strong=currentColor)으로 듀오톤 구현: 베이스 실루엣은 currentColor 32% 불투명,
 * 우하단 배지는 solid currentColor 원 + 흰 글리프(돋보기/체크/시계). viewBox 0 0 40 40.
 */
type QuickAction = {
  titleKey: string;
  descKey: string;
  icon: ReactNode;
};

// 우하단 공통 배지 원(글리프는 각 아이콘에서 흰색으로 얹는다).
const Badge = ({ cx = 30.5 }: { cx?: number }) => (
  <circle cx={cx} cy="30.5" r="7.5" fill="currentColor" />
);

const QUICK_ACTIONS: QuickAction[] = [
  {
    titleKey: "quickFindTitle",
    descKey: "quickFindDesc",
    // 시설 찾기: 체육관 건물 실루엣 + 돋보기 배지
    icon: (
      <>
        <path
          d="M8 19 L20 10 L32 19 V30 a1 1 0 0 1-1 1 H9 a1 1 0 0 1-1-1 Z"
          fill="currentColor"
          fillOpacity={0.32}
        />
        <path
          d="M14 23v7M20 23v7M26 23v7"
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.85}
        />
        <Badge />
        <circle
          cx="29.2"
          cy="29.2"
          r="2.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
        />
        <path
          d="M31.1 31.1l2 2"
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    titleKey: "quickBookTitle",
    descKey: "quickBookDesc",
    // 예약하기: 달력 + 체크 배지
    icon: (
      <>
        <rect
          x="8"
          y="11"
          width="22"
          height="20"
          rx="3"
          fill="currentColor"
          fillOpacity={0.32}
        />
        <path d="M8 17H30" stroke="#fff" strokeWidth={1.6} opacity={0.85} />
        <path
          d="M14 8.5V12.5M24 8.5V12.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Badge />
        <path
          d="M27 30.6l2.2 2.2 4-4.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    titleKey: "quickLookupTitle",
    descKey: "quickLookupDesc",
    // 예약 조회: 문서 + 시계 배지
    icon: (
      <>
        <path
          d="M11 7 h10 l7 7 v16 a1 1 0 0 1-1 1 H12 a1 1 0 0 1-1-1 Z"
          fill="currentColor"
          fillOpacity={0.32}
        />
        <path
          d="M21 7 v7 h7"
          fill="none"
          stroke="#fff"
          strokeWidth={1.4}
          opacity={0.85}
        />
        <path
          d="M15 19 h8 M15 23 h6"
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.85}
        />
        <Badge />
        <circle
          cx="30.5"
          cy="30.5"
          r="3.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.4}
        />
        <path
          d="M30.5 28.6V30.6l1.5 1"
          fill="none"
          stroke="#fff"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    titleKey: "quickMypageTitle",
    descKey: "quickMypageDesc",
    // 마이페이지: 사람 + 체크 배지
    icon: (
      <>
        <circle cx="19" cy="14" r="6" fill="currentColor" fillOpacity={0.32} />
        <path
          d="M8 32c0-6 4.9-9.7 11-9.7s11 3.7 11 9.7z"
          fill="currentColor"
          fillOpacity={0.32}
        />
        <Badge cx={31} />
        <path
          d="M27.5 30.6l2.2 2.2 4-4.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
                  viewBox="0 0 40 40"
                  aria-hidden="true"
                  className="size-[30px] text-accent-strong"
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
