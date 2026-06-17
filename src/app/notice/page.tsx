import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listNotices, type NoticeCategory } from "@/lib/notices";

export const metadata: Metadata = {
  title: "공지사항 — 공공체육관 예약",
  description: "공공체육관 예약 서비스의 공지·점검·안내 사항을 확인하세요.",
};

// 카테고리 배지 색(네이비 토큰 기반).
const CATEGORY_BADGE: Record<NoticeCategory, string> = {
  공지: "bg-accent-tint text-accent-strong",
  점검: "bg-error/10 text-error",
  안내: "bg-surface-2 text-subtle",
};

export default async function NoticePage() {
  const t = await getTranslations("Notice");
  const notices = listNotices();

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{t("intro")}</p>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link
              href={`/notice/${notice.id}`}
              className="flex items-center gap-3 px-1 py-4 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2"
            >
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-bold ${CATEGORY_BADGE[notice.category]}`}
              >
                {notice.category}
              </span>
              <span className="flex-1 truncate text-[15.5px] font-semibold text-foreground">
                {notice.title}
              </span>
              <time
                dateTime={notice.date}
                className="shrink-0 text-[13.5px] tabular-nums text-muted"
              >
                {notice.date}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
