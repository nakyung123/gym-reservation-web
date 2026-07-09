"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * 마이페이지 공통 레이아웃(브레드크럼 + 제목 + 부제).
 * 인증 상태와 무관하게 모든 마이페이지 화면이 이 틀 안에 렌더된다.
 */
export function MypageShell({ children }: { children: ReactNode }) {
  const t = useTranslations("Mypage");
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-9 sm:px-8 sm:py-10">
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              {t("breadcrumbHome")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{t("title")}</li>
        </ol>
      </nav>
      <h1 className="mt-3 text-[28px] font-bold text-foreground sm:text-[32px]">
        {t("title")}
      </h1>
      <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted">
        {t("subtitle")}
      </p>
      {children}
    </div>
  );
}
