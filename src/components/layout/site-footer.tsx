import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * 전역 푸터(layout.tsx에 마운트). 시안 v6 .footer 네이비 다단 구성.
 * 컬럼은 flex space-between로 분배하고, px 값(패딩 44/30·제목 15.5·전화 23 등)을 시안대로 옮겼다.
 *
 * 라벨/제목은 i18n 메시지 키(Footer 네임스페이스)로 관리하고 getTranslations로 렌더한다.
 * 이용약관·개인정보처리방침은 공지사항 상시 게시글(/notice/{id})로 연결한다.
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
    // 바로가기는 GNB 메뉴와 동일하게 맞춘다(라벨·순서 통일).
    titleKey: "quickLinks",
    links: [
      { labelKey: "facilities", href: "/gyms" },
      { labelKey: "guide", href: "/guide" },
      { labelKey: "faq", href: "/faq" },
      { labelKey: "notice", href: "/notice" },
      // 사업 소개: GNB와 동일하게 임시 제외(콘텐츠 갖춰지면 복구).
      // { labelKey: "about", href: "/about" },
    ],
  },
  {
    titleKey: "info",
    links: [
      // 이용약관·개인정보처리방침은 공지사항 게시글로 연결한다.
      { labelKey: "terms", href: "/notice/terms-of-service" },
      { labelKey: "privacy", href: "/notice/privacy-policy" },
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
        {/* 모바일은 2열 grid로 컬럼을 가지런히 정렬하고, sm 이상에서 시안 flex 분배로 복귀한다.
            (flex-wrap + justify-between이 좁은 화면에서 컬럼 간격을 벌려 깨져 보이던 문제 해결) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:flex sm:flex-wrap sm:justify-between sm:gap-[30px]">
          {/* 고객센터 */}
          <div>
            <p className="mb-[9px] text-[15.5px] font-bold text-slate-200">
              {t("customerCenter")}
            </p>
            <p className="text-[23px] font-extrabold tracking-[-0.01em] text-white tabular-nums">
              1234-5678
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

          {/* 소개 — 모바일에서는 설명문이 답답하지 않게 전체 폭(2열 span), sm 이상 시안 폭 복귀 */}
          <div className="col-span-2 max-w-none sm:col-span-1 sm:max-w-[280px]">
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
