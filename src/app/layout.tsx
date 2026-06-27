import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AppHeaderNav } from "@/components/app-header-nav";
import { SiteFooter } from "@/components/site-footer";
import { UserLocationProvider } from "@/hooks/use-user-location";
import { LocationPermissionModal } from "@/components/location-permission-modal";
import { FaqChatWidget } from "@/components/faq-chat-widget";
import "./globals.css";

// 한국어 본문 폰트(공공·신뢰형). 한글 글리프가 커 preload는 끄고 swap 사용.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "서울체육예약",
  description:
    "서울 공공 체육시설의 종목, 운영시간, 가격, 남은 시간대를 한 흐름에서 확인합니다.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 쿠키 기반 i18n: 선택 언어를 <html lang>과 NextIntlClientProvider에 반영한다.
  const locale = await getLocale();
  const t = await getTranslations("Nav");

  return (
    <html lang={locale} className={notoSansKr.variable}>
      <body>
        <NextIntlClientProvider>
          <UserLocationProvider>
            {/* sticky footer 골격: 콘텐츠가 짧아도 푸터가 화면 바닥에 붙도록
                전체를 min-h-screen flex-col로 감싸고 children을 flex-1로 채운다. */}
            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-50 border-b border-line bg-surface">
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
              <div className="flex flex-1 flex-col">{children}</div>
              <SiteFooter />
            </div>
            <LocationPermissionModal />
            <FaqChatWidget />
          </UserLocationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
