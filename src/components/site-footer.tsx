import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * 전역 푸터(layout.tsx에 마운트). 시안 v6 .footer 네이비 다단 구성.
 * 컬럼은 flex space-between로 분배하고, px 값(패딩 44/30·제목 15.5·전화 23 등)을 시안대로 옮겼다.
 *
 * 라벨/제목은 i18n 메시지 키(Footer 네임스페이스)로 관리하고 getTranslations로 렌더한다.
 * href가 없는 항목(이용약관·개인정보처리방침)은 아직 페이지가 없는 메뉴로, 이동하지 않는다.
 */
type FooterLink = {
  labelKey: string;
  href?: string;
};

type FooterColumn = {
  titleKey: string;
  links: FooterLink[];
};

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    // 바로가기는 현재 GNB 5개 메뉴와 동일하게 맞춘다(라벨도 GNB와 통일).
    titleKey: "quickLinks",
    links: [
      { labelKey: "facilities", href: "/gyms" },
      { labelKey: "about", href: "/about" },
      { labelKey: "faq", href: "/faq" },
      { labelKey: "guide", href: "/guide" },
      { labelKey: "notice", href: "/notice" },
    ],
  },
  {
    titleKey: "info",
    links: [
      // 이용약관·개인정보처리방침은 법적 문서라 데모로 채우지 않고 placeholder로 둔다.
      { labelKey: "terms" },
      { labelKey: "privacy" },
    ],
  },
];

function FooterLinkItem({ label, href }: { label: string; href?: string }) {
  // 모바일은 터치 타깃 44px(min-h-[44px]), 데스크톱은 시안 높이로 복귀(sm:min-h-0).
  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex min-h-[44px] items-center text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:min-h-0"
      >
        {label}
      </Link>
    );
  }

  return (
    <span
      className="inline-flex min-h-[44px] cursor-default items-center text-slate-400 sm:min-h-0"
      title="준비 중"
    >
      {label}
    </span>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="mt-6 bg-slate-900 text-[14.5px] text-slate-400">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-[30px] pt-[44px] sm:px-8">
        <div className="flex flex-wrap justify-between gap-[30px]">
          {/* 고객센터 */}
          <div>
            <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
              {t("customerCenter")}
            </p>
            <p className="text-[23px] font-extrabold tracking-[-0.01em] text-white tabular-nums">
              1599-0000
            </p>
            <p className="mt-1.5 text-[13.5px] text-slate-400">{t("hours")}</p>
          </div>

          {/* 링크 컬럼들 */}
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.titleKey} aria-label={t(column.titleKey)}>
              <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
                {t(column.titleKey)}
              </p>
              <ul className="grid gap-[7px]">
                {column.links.map((link) => (
                  <li key={link.labelKey}>
                    <FooterLinkItem label={t(link.labelKey)} href={link.href} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* 소개 */}
          <div className="max-w-[280px]">
            <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
              {t("brand")}
            </p>
            <p className="text-[13.5px] leading-[1.75] text-slate-400">
              {t("brandDesc")}
            </p>
          </div>
        </div>

        <p className="mt-6 border-t border-[#1e293b] pt-[19px] text-[13px] text-[#64748b]">
          {t("copyright")}
        </p>
      </div>
    </footer>
  );
}
