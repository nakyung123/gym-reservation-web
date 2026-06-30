"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeaderNav } from "@/components/app-header-nav";

// 전역 GNB 헤더.
// - 홈(/)에서는 풀스크린 히어로 위에 얹히도록 fixed 투명으로 시작하고, 히어로를 지나
//   스크롤하면 솔리드(배경+보더+그림자)로 전환한다. fixed라 flow를 차지하지 않아
//   히어로가 헤더 뒤까지 꽉 찬다.
// - 그 외 라우트에서는 기존과 동일하게 sticky 불투명 헤더.
export function SiteHeader() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => {
      // 히어로(약 1뷰포트)를 거의 지났을 때 솔리드로 전환.
      setScrolled(window.scrollY > window.innerHeight * 0.6);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const headerClass = isHome
    ? `fixed inset-x-0 top-0 z-50 border-b-[0.5px] transition-colors duration-300 ${
        scrolled
          ? "border-line bg-surface/95 backdrop-blur-sm"
          : "border-black bg-transparent"
      }`
    : "sticky top-0 z-50 border-b border-line bg-surface";

  return (
    <header className={headerClass}>
      <nav
        className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-11 px-5 sm:px-8"
        aria-label="주요 메뉴"
      >
        <Link
          href="/"
          className="flex shrink-0 items-start gap-1 rounded-md text-xl font-extrabold tracking-[-0.02em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <span>{t("brand")}</span>
          {/* 시안 01: 워드마크 우상단 ㄱ자 포인트(네이비) */}
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 size-2.5 text-accent"
          >
            <path d="M3 3h6v6" />
          </svg>
        </Link>
        <AppHeaderNav />
      </nav>
    </header>
  );
}
