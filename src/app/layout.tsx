import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteChrome } from "@/components/layout/site-chrome";
import { UserLocationProvider } from "@/hooks/use-user-location";
import { LocationPermissionModal } from "@/components/layout/location-permission-modal";
import { FaqChatWidget } from "@/components/faq/faq-chat-widget";
import "./globals.css";

// 한국어 본문 폰트(공공·신뢰형). 한글 글리프가 커 preload는 끄고 swap 사용.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  preload: false,
});

// 관리자 콘솔 전용 폰트(Pretendard). 레퍼런스 디자인 기준 폰트로, admin 스코프에서만 쓴다.
// 고객 화면은 이 변수를 참조하지 않으므로 영향 없다(Noto Sans KR 유지).
//
// Std Variable(woff2) 단일 파일로 admin이 쓰는 400~700을 모두 커버한다.
// weight별 .otf 4종(약 6.4MB) 대신 이 파일 1개(약 292KB)를 둔다.
// Std는 KS X 1001(한글 2,350자) 서브셋이라 그 밖의 희귀 음절은 시스템 폰트로 폴백된다
// (글자가 깨지지 않고 서체만 달라진다).
const pretendard = localFont({
  variable: "--font-pretendard",
  src: "./fonts/PretendardStdVariable.woff2",
  weight: "400 800",
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
    <html
      lang={locale}
      className={`${notoSansKr.variable} ${pretendard.variable}`}
    >
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
