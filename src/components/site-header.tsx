"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppHeaderNav } from "@/components/app-header-nav";
import { BrandLogo } from "@/components/brand-logo";

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
  // 홈 히어로 최상단(투명 상태)에서 헤더에 마우스를 올리면, 스크롤을 내렸을 때와
  // 동일한 솔리드 상태로 전환한다. 구분선도 이때 회색→라인 색으로 바뀐다.
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => {
      // 히어로(약 1뷰포트)를 거의 지났을 때 솔리드로 전환.
      setScrolled(window.scrollY > window.innerHeight * 0.6);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  // 스크롤로 내렸거나(hover 포함) 헤더에 마우스가 올라오면 솔리드로 본다.
  const solid = scrolled || hovered;
  // 홈 최상단(투명 상태): 로고/메뉴/구분선을 흰색으로 렌더한다.
  const transparent = isHome && !solid;
  const headerClass = isHome
    ? `fixed inset-x-0 top-0 z-50 border-b-[0.5px] transition-colors duration-300 ${
        solid
          ? "border-line bg-surface/95 backdrop-blur-sm"
          : "border-slate-300 bg-transparent"
      }`
    : "sticky top-0 z-50 border-b border-line bg-surface";

  return (
    <header
      className={headerClass}
      onMouseEnter={isHome ? () => setHovered(true) : undefined}
      onMouseLeave={isHome ? () => setHovered(false) : undefined}
    >
      <nav
        className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-11 px-5 sm:px-8"
        aria-label="주요 메뉴"
      >
        <Link
          href="/"
          aria-label={t("brand")}
          className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <BrandLogo className="text-[24px]" />
        </Link>
        <AppHeaderNav transparent={transparent} />
      </nav>
    </header>
  );
}
