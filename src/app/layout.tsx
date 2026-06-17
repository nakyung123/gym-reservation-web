import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
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
  title: "공공체육관 예약",
  description:
    "서울 공공체육관의 종목, 운영시간, 가격, 남은 시간대를 한 흐름에서 확인합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body>
        <UserLocationProvider>
          <header className="sticky top-0 z-50 border-b border-line bg-surface">
            <nav
              className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-11 px-5 sm:px-8"
              aria-label="주요 메뉴"
            >
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2.5 rounded-md text-xl font-extrabold tracking-[-0.02em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span
                  className="grid size-8 place-items-center rounded-[9px] bg-accent text-accent-ink"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-[19px]"
                  >
                    <path d="M6 4v16M18 4v16M6 12h12M3 8v8M21 8v8" />
                  </svg>
                </span>
                공공체육관
              </Link>
              <AppHeaderNav />
            </nav>
          </header>
          {children}
          <SiteFooter />
          <LocationPermissionModal />
          <FaqChatWidget />
        </UserLocationProvider>
      </body>
    </html>
  );
}
