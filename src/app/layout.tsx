import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { AppHeaderNav } from "@/components/app-header-nav";
import { UserLocationProvider } from "@/hooks/use-user-location";
import { LocationPermissionModal } from "@/components/location-permission-modal";
import "./globals.css";

// 한국어 본문 폰트(공공·신뢰형). 한글 글리프가 커 preload는 끄고 swap 사용.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="ko" className={`${notoSansKr.variable} ${geistMono.variable}`}>
      <body>
        <UserLocationProvider>
          <header className="sticky top-0 z-10 border-b border-line bg-white">
            <nav
              className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8 lg:px-10"
              aria-label="주요 메뉴"
            >
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2 rounded-md text-base font-extrabold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span
                  className="grid size-7 place-items-center rounded-md bg-accent text-accent-ink"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M6 4v16M18 4v16M6 12h12M3 8v8M21 8v8" />
                  </svg>
                </span>
                공공체육관
              </Link>
              <AppHeaderNav />
            </nav>
          </header>
          <div className="border-b border-amber-200 bg-amber-50">
            <p className="mx-auto max-w-6xl px-4 py-2 text-xs font-semibold leading-5 text-amber-900 sm:px-8 lg:px-10">
              화면에서 생성한 예약은 실제 시설 예약으로 접수되지 않습니다.
            </p>
          </div>
          {children}
          <LocationPermissionModal />
        </UserLocationProvider>
      </body>
    </html>
  );
}
