import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
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

  return (
    <html lang={locale} className={notoSansKr.variable}>
      <body>
        <NextIntlClientProvider>
          <UserLocationProvider>
            <SiteChrome
              header={<SiteHeader />}
              footer={<SiteFooter />}
              overlays={
                <>
                  <LocationPermissionModal />
                  <FaqChatWidget />
                </>
              }
            >
              {children}
            </SiteChrome>
          </UserLocationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
