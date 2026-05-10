import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <nav
            className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8 lg:px-10"
            aria-label="주요 메뉴"
          >
            <Link
              href="/"
              className="shrink-0 rounded text-sm font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              공공체육관
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/gyms"
                className="inline-flex h-9 items-center rounded px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:px-3"
              >
                체육관
              </Link>
              <Link
                href="/reservations"
                className="inline-flex h-9 items-center rounded px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:px-3"
              >
                내 예약
              </Link>
            </div>
          </nav>
        </header>
        <div className="border-b border-amber-200 bg-amber-50">
          <p className="mx-auto max-w-6xl px-4 py-2 text-xs font-semibold leading-5 text-amber-900 sm:px-8 lg:px-10">
            화면에서 생성한 예약은 실제 시설 예약으로 접수되지 않습니다.
          </p>
        </div>
        {children}
      </body>
    </html>
  );
}
