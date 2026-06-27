import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getNotice, listNotices, type Notice } from "@/lib/notices";
import {
  getNoticeViewCount,
  incrementNoticeView,
} from "@/lib/server/db-notice-view-repository";

type Params = { params: Promise<{ id: string }> };

// 진입마다 조회수를 올려야 하므로 정적 캐시 대신 매 요청 렌더한다.
// 목록 행 Link는 prefetch={false}라 프리페치로 인한 중복 증가가 없다.
export const dynamic = "force-dynamic";

// KMI 공지 상세(원문)를 실측대로 옮긴 PC 우선 레이아웃.
// 실측: 제목 36px/700 mb32 / header pb36 border-b mb40 / 메타 16px #555 '날짜 | 조회'
//   본문 18px line-height1.8 / post-nav border-t flex space-between(이전 글 좌·다음 글 우)
//   목록 버튼 160x60 radius30 네이비 18px 가운데. breadcrumb 없음, 컨테이너는 사이트 표준 폭.
// 색만 우리 토큰(네이비=accent)으로. 작성자(서울체육예약)는 유지하되 KMI식 파이프 메타에 포함.

// 발행일 표기: 목록과 동일하게 점 구분(YYYY.MM.DD).
function formatDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const notice = getNotice(id);
  return {
    title: notice
      ? `${notice.title} — 공지사항`
      : "공지사항 — 서울체육예약",
  };
}

export default async function NoticeDetailPage({ params }: Params) {
  const { id } = await params;
  const notice = getNotice(id);
  if (!notice) {
    notFound();
  }
  const t = await getTranslations("Notice");

  // 조회수 +1 (best-effort). 실패해도 페이지는 정상 렌더하고 폴백 카운트를 보여준다.
  let views = 0;
  try {
    views = await incrementNoticeView(notice.id);
  } catch (error) {
    console.error("[notice] 조회수 증가 실패", error);
    try {
      views = await getNoticeViewCount(notice.id);
    } catch {
      views = 0;
    }
  }

  // 이전/다음 글: 목록은 최신순(desc)이라 index+1=더 과거(이전 글), index-1=더 최신(다음 글).
  const all = listNotices();
  const current = all.findIndex((item) => item.id === notice.id);
  const older = current < all.length - 1 ? all[current + 1] : null; // 이전 글
  const newer = current > 0 ? all[current - 1] : null; // 다음 글

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 sm:py-16">
      {/* 제목 + 메타 (KMI page-header: pb36 + 하단 구분선 + mb40) */}
      <header className="border-b border-line pb-8 sm:pb-9">
        <h1 className="text-[26px] font-bold leading-snug text-[#1d1d1d] sm:text-[36px]">
          {notice.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] text-[#555] sm:mt-7 sm:text-[16px]">
          <span>{t("author")}</span>
          <span aria-hidden="true" className="text-line-strong">
            |
          </span>
          <time dateTime={notice.date} className="tabular-nums">
            {formatDate(notice.date)}
          </time>
          <span aria-hidden="true" className="text-line-strong">
            |
          </span>
          <span>
            {t("views")}{" "}
            <span className="tabular-nums">{views}</span>
          </span>
        </div>
      </header>

      {/* 본문 (KMI: 18px / line-height 1.8) */}
      <div className="mt-10 space-y-6 text-[16px] leading-[1.8] text-[#1d1d1d] sm:text-[18px]">
        {notice.body.split("\n\n").map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>

      {/* 이전/다음 글 (KMI post-nav: border-top + flex space-between) */}
      <nav
        aria-label={`${t("prev")} / ${t("next")}`}
        className="mt-12 border-y border-line sm:mt-16"
      >
        <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:py-[30px]">
          <PostNavItem
            side="prev"
            label={t("prev")}
            item={older}
            emptyLabel={t("noPrev")}
          />
          <PostNavItem
            side="next"
            label={t("next")}
            item={newer}
            emptyLabel={t("noNext")}
          />
        </div>
      </nav>

      {/* 목록 버튼 (KMI btn lg fill primary: 160x60 radius30 네이비 가운데) */}
      <div className="mt-8 flex justify-center sm:mt-10">
        <Link
          href="/notice"
          className="inline-flex h-[60px] min-w-[160px] items-center justify-center rounded-[30px] bg-accent px-8 text-[18px] font-medium text-white transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("backToList")}
        </Link>
      </div>
    </main>
  );
}

// 이전/다음 글 한 칸. KMI식: 이전 글 = [← 이전 글 제목](좌), 다음 글 = [제목 다음 글 →](우).
function PostNavItem({
  side,
  label,
  item,
  emptyLabel,
}: {
  side: "prev" | "next";
  label: string;
  item: Notice | null;
  emptyLabel: string;
}) {
  const isNext = side === "next";
  const arrow = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 shrink-0 text-subtle"
    >
      <path d={isNext ? "M5 12h14M13 6l6 6-6 6" : "M19 12H5M11 6l-6 6 6 6"} />
    </svg>
  );
  const labelEl = (
    <span className="shrink-0 text-[15px] font-semibold text-subtle sm:text-[16px]">
      {label}
    </span>
  );
  const titleEl = item ? (
    <span className="truncate text-[15px] text-foreground transition group-hover:text-accent-strong sm:text-[16px]">
      {item.title}
    </span>
  ) : (
    <span className="truncate text-[15px] text-line-strong sm:text-[16px]">
      {emptyLabel}
    </span>
  );

  // 좌: 화살표·라벨·제목 / 우: 제목·라벨·화살표(끝에 정렬).
  const rowClass = `flex min-w-0 items-center gap-3 sm:max-w-[46%] ${
    isNext ? "sm:justify-end sm:text-right" : ""
  }`;
  const inner = isNext ? (
    <>
      {titleEl}
      {labelEl}
      {arrow}
    </>
  ) : (
    <>
      {arrow}
      {labelEl}
      {titleEl}
    </>
  );

  if (!item) {
    return <div className={rowClass}>{inner}</div>;
  }
  return (
    <Link
      href={`/notice/${item.id}`}
      prefetch={false}
      className={`group ${rowClass}`}
    >
      {inner}
    </Link>
  );
}
