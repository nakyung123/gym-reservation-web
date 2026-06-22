"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useSyncExternalStore } from "react";
import { signOut } from "firebase/auth";
import { useTranslations } from "next-intl";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { getFirebaseClient } from "@/lib/firebase-client";
import { LocaleSwitcher } from "@/components/locale-switcher";

// 메인 GNB + 우측 유틸. layout.tsx의 헤더 nav 안에서 로고 다음에 렌더된다.
// 라벨은 i18n 메시지 키(Nav 네임스페이스)로 관리하고 useTranslations로 렌더한다.
// - GNB(시설 찾기/사업 소개/문의·FAQ/이용 안내/공지사항)는 라우트로 연결한다.
//   예약하기·예약 조회는 GNB에서 제외한다(검색→시설 상세→예약 흐름). 예약 조회는
//   마이페이지 '예약내역' 탭(기본 탭)으로 통합돼 로그인 사용자는 우측 유틸 "마이페이지"로 접근한다.
//   로그인 사용자의 우측 유틸은 [마이페이지 · 로그아웃]이다(로그아웃은 Link가 아닌 버튼).
// - 시설 찾기는 hover 시 메가메뉴(종목별/지역별)를 연다. CSS hover/focus-within 기반.
//   메가메뉴 항목(종목·지역명)은 데이터성이라 1차 i18n 범위에서 제외(한국어 유지).
// 항목 추가/삭제/순서는 배열에서만 관리한다. (구조 유연성 우선)
type GnbItem = {
  key: string;
  href?: string;
  mega?: boolean;
};

const GNB_ITEMS: GnbItem[] = [
  { key: "facilities", href: "/gyms", mega: true },
  { key: "about", href: "/about" },
  { key: "faq", href: "/faq" },
  { key: "guide", href: "/guide" },
  { key: "notice", href: "/notice" },
];

// 메가메뉴 내용. 제목은 메시지 키, 항목(종목·지역명)은 데이터성이라 한국어 유지.
// (종목·지역 필터 쿼리는 /gyms 필터 계약이 정해지면 이 배열의 href만 채우면 된다.)
const FACILITY_MEGA: { titleKey: string; items: string[] }[] = [
  { titleKey: "bySport", items: ["배드민턴", "탁구", "풋살", "농구", "배구"] },
  { titleKey: "byRegion", items: ["금천구", "노원구", "마포구", "전체 보기"] },
];

const GNB_BASE =
  "relative flex h-full items-center px-5 text-[17px] font-bold transition after:absolute after:inset-x-5 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:content-['']";
const GNB_LINK_CLASS = `${GNB_BASE} text-foreground hover:text-accent-strong hover:after:scale-x-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset`;

const MEGA_TITLE_CLASS =
  "col-span-2 text-[13px] font-bold tracking-[0.04em] text-subtle";
const MEGA_LINK_CLASS =
  "flex items-center gap-2 rounded-lg px-[11px] py-2.5 text-[15.5px] text-muted transition hover:bg-accent-tint hover:text-accent-strong focus-visible:outline-none focus-visible:bg-accent-tint focus-visible:text-accent-strong";

const UTIL_LINK_CLASS =
  "rounded text-[14.5px] font-semibold text-muted transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

// 모바일 드로어: 터치 타깃 44px 이상(min-h-[44px]) 확보.
const MOBILE_LINK_CLASS =
  "flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2.5 text-base font-bold text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2";
const MOBILE_UTIL_CLASS =
  "flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-line-strong text-[14.5px] font-bold text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function UtilSeparator() {
  return <span className="h-[13px] w-px bg-line-strong" aria-hidden="true" />;
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px] text-subtle"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FacilityMega() {
  const t = useTranslations("Nav");
  return (
    <div
      className="invisible absolute left-0 top-full z-10 grid w-[600px] -translate-y-1.5 grid-cols-2 gap-x-[30px] gap-y-1.5 rounded-b-xl border border-line bg-white px-[26px] py-6 opacity-0 shadow-[0_4px_16px_rgba(15,23,42,0.09)] transition group-hover/facility:visible group-hover/facility:translate-y-0 group-hover/facility:opacity-100 group-focus-within/facility:visible group-focus-within/facility:translate-y-0 group-focus-within/facility:opacity-100"
      role="menu"
    >
      {FACILITY_MEGA.map((group, groupIndex) => (
        <div
          key={group.titleKey}
          className="col-span-2 grid grid-cols-2 gap-x-[30px] gap-y-1.5"
        >
          <span
            className={`${MEGA_TITLE_CLASS} ${groupIndex > 0 ? "mt-3.5" : ""} mb-1.5`}
          >
            {t(group.titleKey)}
          </span>
          {group.items.map((item) => (
            <Link
              key={item}
              href="/gyms"
              className={MEGA_LINK_CLASS}
              role="menuitem"
            >
              <span
                className="size-1 rounded-full bg-line-strong"
                aria-hidden="true"
              />
              {item}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AppHeaderNav() {
  const t = useTranslations("Nav");
  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);
  const signedIn = session.ok;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // 로그아웃: 우측 유틸 버튼(예약 조회가 있던 자리). 성공 시 홈으로 보낸다.
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
      router.replace("/");
    } catch {
      // 실패 시 버튼을 다시 활성화해 재시도할 수 있게 한다.
      setLoggingOut(false);
    }
  };

  // 로그인 상태에 따른 우측 유틸 링크(데스크톱 바·모바일 드로어에서 공유).
  const utilLinks = signedIn
    ? [{ key: "mypage", href: "/mypage" }]
    : [
        { key: "login", href: "/login" },
        { key: "signup", href: "/signup" },
      ];

  return (
    <>
      {/* 데스크톱 GNB */}
      <ul className="hidden h-full flex-1 items-stretch gap-1 lg:flex">
        {GNB_ITEMS.map((item) => (
          <li
            key={item.key}
            className={`relative flex items-center ${
              item.mega ? "group/facility" : ""
            }`}
          >
            {item.href ? (
              <Link href={item.href} className={GNB_LINK_CLASS}>
                {t(item.key)}
              </Link>
            ) : null}
            {item.mega ? <FacilityMega /> : null}
          </li>
        ))}
      </ul>

      {/* 데스크톱 우측 유틸 */}
      <div className="ml-auto hidden items-center gap-3.5 lg:flex">
        {utilLinks.map((link, index) => (
          <Fragment key={link.href}>
            {index > 0 ? <UtilSeparator /> : null}
            <Link href={link.href} className={UTIL_LINK_CLASS}>
              {t(link.key)}
            </Link>
          </Fragment>
        ))}
        {signedIn ? (
          <>
            <UtilSeparator />
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={`${UTIL_LINK_CLASS} disabled:cursor-not-allowed disabled:text-line-strong`}
            >
              {loggingOut ? t("loggingOut") : t("logout")}
            </button>
          </>
        ) : null}
        <UtilSeparator />
        <LocaleSwitcher />
      </div>

      {/* 모바일 햄버거 */}
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        className="ml-auto grid size-11 place-items-center rounded-lg border border-line-strong text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-[22px]"
        >
          {menuOpen ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* 모바일 드로어 */}
      {menuOpen ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeMenu}
            className="fixed bottom-0 left-0 right-0 top-[76px] z-40 bg-slate-900/30 lg:hidden"
          />
          <nav
            id="mobile-menu"
            aria-label={t("openMenu")}
            className="fixed inset-x-0 top-[76px] z-40 max-h-[calc(100vh-76px)] overflow-y-auto border-b border-line bg-white shadow-[0_12px_24px_rgba(15,23,42,0.12)] lg:hidden"
          >
            <div className="mx-auto w-full max-w-[1440px] px-5 py-2 sm:px-8">
              <ul>
                {GNB_ITEMS.map((item) =>
                  item.href ? (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        className={MOBILE_LINK_CLASS}
                      >
                        {t(item.key)}
                        <ChevronRight />
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
              <div className="my-2 h-px bg-line" aria-hidden="true" />
              <div className="flex items-center gap-2 pb-2">
                {utilLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className={MOBILE_UTIL_CLASS}
                  >
                    {t(link.key)}
                  </Link>
                ))}
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      handleLogout();
                    }}
                    disabled={loggingOut}
                    className={MOBILE_UTIL_CLASS}
                  >
                    {loggingOut ? t("loggingOut") : t("logout")}
                  </button>
                ) : null}
              </div>
              <div className="flex justify-end pb-3">
                <LocaleSwitcher />
              </div>
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
