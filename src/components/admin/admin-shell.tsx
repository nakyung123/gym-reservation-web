"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { useAdminEmail } from "@/components/admin/admin-auth-gate";
import { AdminNavIconSvg } from "@/components/admin/admin-nav-icons";
import {
  ADMIN_HOME,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  findAdminNavItem,
  type AdminNavIcon,
} from "@/components/admin/admin-nav-items";

/**
 * 관리자 콘솔 셸 (레퍼런스 재디자인).
 *
 * 고객 화면(중앙정렬 + GNB/푸터)이 아니라 **백오피스 3분할 셸**이다.
 *  - 좌측 흰 사이드바(그룹형 라인 아이콘) + 상단바(검색·퀵네비·프로필) + 회색 캔버스.
 *  - 색·폰트는 .admin-console 스코프 토큰(globals.css, 퍼플 #5F43FF · Pretendard · 플랫).
 *  - 그림자·그라디언트 없이 하이라인 보더로 구분한다.
 *  - 제목·부제·그룹·아이콘은 admin-nav-items SSOT에서 pathname으로 파생한다.
 *
 * 모바일은 사이드바를 숨기고 상단 햄버거로 같은 목록을 펼친다.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ADMIN_HOME.href;
  // 매칭되는 메뉴가 없으면(=/admin 루트) 대시보드다. current=null이면 제목 블록을 숨긴다.
  const current = findAdminNavItem(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 데스크톱 사이드바: 흰 배경, 화면에 고정되고 메뉴가 길어지면 안에서만 스크롤한다. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center px-6">
          <span className="text-[16px] font-bold text-foreground">
            운영 콘솔
          </span>
        </div>
        <nav
          aria-label="관리 메뉴"
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        >
          <AdminNavList currentHref={current?.href ?? null} isHome={!current} />
        </nav>
        <div className="shrink-0 border-t border-line p-3">
          <Link
            href="/"
            className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium text-muted transition hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-5 shrink-0"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            고객 사이트로
          </Link>
        </div>
      </aside>

      {/* min-w-0: 넓은 표가 사이드바를 밀어내지 않고 본문 안에서 가로 스크롤되게 한다. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-line bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-nav"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <span className="sr-only">관리 메뉴 열기</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              aria-hidden="true"
              className="size-[18px]"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <AdminSearch />

          <nav aria-label="빠른 이동" className="ml-2 hidden items-center gap-1 md:flex">
            <AdminQuickLink href="/admin" label="대시보드" active={!current} />
            <AdminQuickLink
              href="/admin/reservations"
              label="예약"
              active={pathname.startsWith("/admin/reservations")}
            />
            <AdminQuickLink
              href="/admin/inquiries"
              label="문의"
              active={pathname.startsWith("/admin/inquiries")}
            />
            <AdminQuickLink
              href="/admin/customers"
              label="고객"
              active={pathname.startsWith("/admin/customers")}
            />
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <AdminAccountMenu />
          </div>
        </header>

        {/* 모바일 메뉴: 사이드바와 같은 항목을 그대로 쓴다. */}
        {menuOpen ? (
          <nav
            id="admin-mobile-nav"
            aria-label="관리 메뉴"
            className="border-b border-line bg-white px-3 py-3 lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <AdminNavList currentHref={current?.href ?? null} isHome={!current} />
          </nav>
        ) : null}

        <main className="flex-1 p-4 sm:p-6">
          {/* 대시보드(홈)는 사이드바로 위치가 이미 명확하고 제목이 중복이라 숨긴다.
              서브 페이지는 제목·설명이 안내로 유용하므로 그대로 노출한다. */}
          {current ? (
            <div className="mb-5 flex flex-col gap-1">
              <h1 className="text-[20px] font-bold text-foreground">
                {current.title}
              </h1>
              <p className="text-[13px] leading-relaxed text-subtle">
                {current.description}
              </p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

/** 상단 검색창. 시각·구조 우선(동작 배선은 후속). placeholder 단독이 아니라 sr-only 라벨을 둔다. */
function AdminSearch() {
  return (
    <div className="hidden items-center gap-2.5 sm:flex">
      <label htmlFor="admin-search" className="sr-only">
        예약·고객·시설 검색
      </label>
      <div className="flex h-10 w-64 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 lg:w-80">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-[18px] shrink-0 text-subtle"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          id="admin-search"
          type="search"
          placeholder="예약번호·고객·시설 검색"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-subtle"
        />
      </div>
    </div>
  );
}

/** 상단 퀵네비 링크. 사이드바와 별개의 빠른 이동(레퍼런스 상단 네비). */
function AdminQuickLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-xl px-3.5 text-[14px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? "bg-accent-tint font-bold text-accent-strong"
          : "font-semibold text-muted hover:bg-surface-2 hover:text-accent-strong"
      }`}
    >
      {label}
    </Link>
  );
}

/** 사이드바·모바일 메뉴가 공유하는 목록. 대시보드는 그룹 밖 최상단에 둔다. */
function AdminNavList({
  currentHref,
  isHome,
}: {
  currentHref: string | null;
  isHome: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 pt-2">
      <ul>
        <AdminNavLink
          href={ADMIN_HOME.href}
          label={ADMIN_HOME.title}
          icon={ADMIN_HOME.icon}
          active={isHome}
        />
      </ul>

      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="px-3 pb-2 text-[10.5px] font-bold tracking-[0.07em] text-subtle">
            {group}
          </p>
          <ul className="flex flex-col gap-1">
            {ADMIN_NAV_ITEMS.filter((item) => item.group === group).map(
              (item) => (
                <AdminNavLink
                  key={item.href}
                  href={item.href}
                  label={item.title}
                  icon={item.icon}
                  active={currentHref === item.href}
                />
              ),
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

// 선택 항목은 라벤더 틴트 + 퍼플로 표시한다(레퍼런스 활성 상태).
function AdminNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: AdminNavIcon;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active
            ? "bg-accent-tint font-semibold text-accent-strong"
            : "font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <AdminNavIconSvg name={icon} />
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

// 상단바에 이메일 전체를 노출하지 않도록 로컬부 앞 2글자만 남기고 가린다(도메인은 유지).
//  zpxmrl12345@gmail.com → zp****@gmail.com. @가 없거나 로컬부가 짧아도 안전하게 처리한다.
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return `${email.slice(0, 2)}****`;
  }
  return `${email.slice(0, 2)}****${email.slice(at)}`;
}

/** 상단바 계정 영역. 이메일은 게이트가 이미 확인한 값을 컨텍스트로 받는다. 아바타는 사람 아이콘. */
function AdminAccountMenu() {
  const email = useAdminEmail();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const { auth } = getFirebaseClient();
    try {
      await signOut(auth);
      // 성공하면 게이트가 signed-out을 감지해 로그인 폼으로 되돌린다.
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 text-muted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-[18px]"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      </span>
      <span className="hidden max-w-45 truncate text-[13.5px] font-semibold text-muted sm:inline">
        {email ? maskEmail(email) : "관리자"}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="h-9 rounded-xl border border-line-strong px-3 text-[13px] font-bold text-muted transition hover:border-accent hover:text-accent-strong disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {signingOut ? "로그아웃 중" : "로그아웃"}
      </button>
    </div>
  );
}
