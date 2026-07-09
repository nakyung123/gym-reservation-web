import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

/**
 * 홈 예약 흐름 가이드 카드. 클릭 동작이 없는 안내용(가이드)이라 Link가 아닌 정적 div로 둔다.
 * 그림자·hover 전환 없이 평면 카드로, 흐름(시설 찾기 → 예약하기 → 예약 조회 → 마이페이지)만
 * 보여준다. 실제 진입은 상단 검색바·시설 찾기로 한다. 항목은 QUICK_ACTIONS 배열에서만 관리한다.
 *
 * 아이콘 = 확정 시안 "예약 흐름 아이콘 v3.3"(icons-preview.html)의 SVG를 그대로 옮긴 것.
 * viewBox 0 0 40 40. 색: 베이스 #BCC8F2 / 배지 #1E3A8A / 딥(셔틀콕·달력헤더) #2745B3.
 * 배경 사각형 없이 아이콘만 노출(시안과 동일).
 */
const IC_BASE = "#BCC8F2";
const IC_DEEP = "#2745B3";
const IC_BADGE = "#1E3A8A";

type QuickAction = {
  titleKey: string;
  descKey: string;
  icon: ReactNode;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    titleKey: "quickFindTitle",
    descKey: "quickFindDesc",
    // 시설 찾기: 코트(체육관) + 셔틀콕 + 돋보기 배지
    icon: (
      <>
        <rect x="5" y="9.5" width="24" height="17" rx="2" fill={IC_BASE} />
        <g stroke="#fff" strokeWidth={1.3} fill="none" strokeLinecap="round">
          <rect x="7.3" y="11.8" width="19.4" height="12.4" rx="0.5" />
          <line x1="17" y1="11.8" x2="17" y2="24.2" strokeWidth={1.9} />
          <line x1="11.6" y1="11.8" x2="11.6" y2="24.2" />
          <line x1="22.4" y1="11.8" x2="22.4" y2="24.2" />
          <line x1="7.3" y1="18" x2="11.6" y2="18" />
          <line x1="22.4" y1="18" x2="26.7" y2="18" />
        </g>
        <path d="M20.4 17.6 L17.2 11.2 A 5.2 5.2 0 0 1 23.6 11.2 Z" fill={IC_DEEP} />
        <circle cx="20.4" cy="16.7" r="1.9" fill={IC_DEEP} />
        <circle cx="30" cy="30" r="8" fill={IC_BADGE} />
        <circle cx="28.7" cy="28.7" r="2.5" fill="none" stroke="#fff" strokeWidth={1.6} />
        <line x1="30.6" y1="30.6" x2="32.7" y2="32.7" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
      </>
    ),
  },
  {
    titleKey: "quickBookTitle",
    descKey: "quickBookDesc",
    // 예약하기: 달력 + 체크 배지
    icon: (
      <>
        <rect x="5" y="8" width="24" height="23" rx="3" fill={IC_BASE} />
        <path d="M5 11 a3 3 0 0 1 3-3 h18 a3 3 0 0 1 3 3 v3 H5 Z" fill={IC_DEEP} />
        <rect x="9.6" y="5" width="2.4" height="6" rx="1.2" fill={IC_DEEP} />
        <rect x="22" y="5" width="2.4" height="6" rx="1.2" fill={IC_DEEP} />
        <rect x="9" y="18" width="3" height="3" rx="0.8" fill="#fff" />
        <rect x="15.5" y="18" width="3" height="3" rx="0.8" fill="#fff" />
        <rect x="9" y="23.5" width="3" height="3" rx="0.8" fill="#fff" />
        <circle cx="30" cy="30" r="8" fill={IC_BADGE} />
        <path
          d="M26.4 30 l2.3 2.3 l4-4.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.9}
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
        <rect x="7" y="5" width="20" height="28" rx="2.5" fill={IC_BASE} />
        <rect x="10.5" y="10" width="13" height="2.4" rx="1.2" fill="#fff" />
        <rect x="10.5" y="15" width="13" height="2.4" rx="1.2" fill="#fff" />
        <rect x="10.5" y="20" width="8" height="2.4" rx="1.2" fill="#fff" />
        <circle cx="30" cy="30" r="8" fill={IC_BADGE} />
        <circle cx="30" cy="30" r="4.3" fill="none" stroke="#fff" strokeWidth={1.5} />
        <path
          d="M30 27.5 V30 l1.8 1.1"
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
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
        <circle cx="17" cy="13.5" r="5.5" fill={IC_BASE} />
        <path d="M6.5 30.5 a11 10 0 0 1 22 0 Z" fill={IC_BASE} />
        <circle cx="30" cy="30" r="8" fill={IC_BADGE} />
        <path
          d="M26.4 30 l2.3 2.3 l4-4.4"
          fill="none"
          stroke="#fff"
          strokeWidth={1.9}
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
    <section className="py-[72px]">
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mb-[30px]">
          <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
            GUIDE
          </p>
          <h2 className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-slate-950">
            {t("quickSectionTitle")}
          </h2>
          <p className="mt-[9px] text-[16.5px] text-muted">
            {t("quickSectionSubtitle")}
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.titleKey}>
            <div className="flex h-full flex-col rounded-xl border border-line bg-white px-6 py-7">
              <svg
                viewBox="0 0 40 40"
                fill="none"
                aria-hidden="true"
                className="mb-5 size-12"
              >
                {action.icon}
              </svg>
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
    </section>
  );
}
