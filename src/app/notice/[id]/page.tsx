import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getNotice, listNotices, type NoticeCategory } from "@/lib/notices";

type Params = { params: Promise<{ id: string }> };

// 카테고리 배지 색(네이비 토큰 기반).
const CATEGORY_BADGE: Record<NoticeCategory, string> = {
  공지: "bg-accent-tint text-accent-strong",
  점검: "bg-error/10 text-error",
  안내: "bg-surface-2 text-subtle",
};

// 정적 데이터라 빌드 시 상세 경로를 미리 생성한다.
export function generateStaticParams() {
  return listNotices().map((notice) => ({ id: notice.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const notice = getNotice(id);
  return {
    title: notice
      ? `${notice.title} — 공지사항`
      : "공지사항 — 공공체육관 예약",
  };
}

export default async function NoticeDetailPage({ params }: Params) {
  const { id } = await params;
  const notice = getNotice(id);
  if (!notice) {
    notFound();
  }
  const t = await getTranslations("Notice");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <Link
        href="/notice"
        className="inline-flex items-center gap-1 text-[14px] font-semibold text-muted transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">←</span> {t("backToList")}
      </Link>

      <article className="mt-5 border-t border-line pt-6">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-[12.5px] font-bold ${CATEGORY_BADGE[notice.category]}`}
        >
          {notice.category}
        </span>
        <h1 className="mt-3 text-2xl font-bold leading-snug text-foreground">
          {notice.title}
        </h1>
        <time
          dateTime={notice.date}
          className="mt-2 block text-[13.5px] tabular-nums text-muted"
        >
          {notice.date}
        </time>

        <div className="mt-6 space-y-4 border-t border-line pt-6 text-[15px] leading-relaxed text-foreground">
          {notice.body.split("\n\n").map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
