import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BoardPagination } from "@/components/ui/board-pagination";
import { SearchBar } from "@/components/home/search-bar";
import {
  listNormalNotices,
  listNotices,
  listPinnedNotices,
  type Notice,
} from "@/lib/notices";

export const metadata: Metadata = {
  title: "공지사항 — 서울체육예약",
  description: "서울체육예약 서비스의 공지·점검·안내 사항을 확인하세요.",
};

// KMI 'KMI 소식' 게시판을 우리 톤으로 옮긴 공지 목록.
//  - 상단: 우리식 심플 헤더(breadcrumb + h1 + 설명) + 공용 검색바(SearchBar, FAQ와 공유).
//  - 게시판: 주요공지(pinned)를 상단에 배경색으로 구분해 고정, 일반 공지는 최신순 순번 부여.
//  - 컬럼: [번호/주요공지] · 제목 · 작성자 · 등록일. 페이지네이션은 공용 BoardPagination(FAQ와 공유).
//  - 검색/페이지는 URL 쿼리(?q=&page=)로 서버 렌더. 검색 중에는 고정 없이 평면 결과.

const PER_PAGE = 10;

// 발행일 표기: KMI와 동일하게 점 구분(YYYY.MM.DD).
function formatDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

const SEARCH_FIELDS = ["all", "title", "content"] as const;

// field/q/page를 보존한 목록 URL.
function listHref(page: number, q: string, field: string): string {
  const params = new URLSearchParams();
  if (field && field !== "all") params.set("field", field);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/notice?${query}` : "/notice";
}

type SearchParams = Promise<{ page?: string; q?: string; field?: string }>;
type Row = { notice: Notice; number: number };

export default async function NoticePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations("Notice");
  // 페이지네이션 5키는 Common 네임스페이스 SSOT를 쓴다(서버 컴포넌트라 훅 대신 직접 조회).
  const tCommon = await getTranslations("Common");
  const {
    page: pageParam,
    q: qParam,
    field: fieldParam,
  } = await searchParams;
  const query = (qParam ?? "").trim();
  const field = SEARCH_FIELDS.includes(
    (fieldParam ?? "") as (typeof SEARCH_FIELDS)[number],
  )
    ? (fieldParam as string)
    : "all";
  const isSearching = query.length > 0;

  // 검색 중에는 주요공지 구분 없이 전체에서 검색 범위(전체/제목/내용)로 매칭(평면), 아니면 일반 공지만 순번/페이지.
  const source = isSearching
    ? listNotices().filter((notice) => {
        if (field === "title") return notice.title.includes(query);
        if (field === "content") return notice.body.includes(query);
        return notice.title.includes(query) || notice.body.includes(query);
      })
    : listNormalNotices();
  const pinned = isSearching ? [] : listPinnedNotices();

  const totalPages = Math.max(1, Math.ceil(source.length / PER_PAGE));
  const requested = Number.parseInt(pageParam ?? "1", 10);
  const page = Math.min(
    Math.max(1, Number.isNaN(requested) ? 1 : requested),
    totalPages,
  );
  const rows: Row[] = source
    .slice((page - 1) * PER_PAGE, page * PER_PAGE)
    .map((notice, index) => ({
      notice,
      number: source.length - ((page - 1) * PER_PAGE + index),
    }));

  const isEmpty = pinned.length === 0 && rows.length === 0;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12">
      {/* breadcrumb */}
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              {t("breadcrumbHome")}
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{t("title")}</li>
        </ol>
      </nav>

      {/* 헤더 */}
      <h1 className="mt-4 text-[28px] font-bold text-foreground sm:text-[32px]">
        {t("title")}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{t("intro")}</p>

      {/* 검색바 (공용 SearchBar, 문의·FAQ와 동일 규격). 위·아래 60px */}
      <div className="mt-[60px]">
        <SearchBar
          action="/notice"
          variant="board"
          placeholder={t("searchPlaceholder")}
          searchLabel={t("searchLabel")}
          fields={[
            { value: "all", label: t("allCategory") },
            { value: "title", label: t("fieldTitle") },
            { value: "content", label: t("fieldContent") },
          ]}
          defaultField={field}
          defaultQuery={query}
        />
      </div>

      {/* 게시판 */}
      <div className="mt-[60px] border-t-2 border-foreground/80">
        {isEmpty ? (
          <p className="pt-[50px] pb-20 text-center text-[15px] text-foreground">
            {isSearching ? t("searchEmpty") : t("empty")}
          </p>
        ) : (
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[92px] sm:w-[120px]" />
              <col />
              <col className="hidden sm:table-column sm:w-[150px]" />
              <col className="w-[92px] sm:w-[140px]" />
            </colgroup>
            {/* 화면엔 안 보이지만 스크린리더용 컬럼 헤더(KMI도 헤더 행 없음) */}
            <thead className="sr-only">
              <tr>
                <th scope="col">번호</th>
                <th scope="col">제목</th>
                <th scope="col">{t("author")}</th>
                <th scope="col">날짜</th>
              </tr>
            </thead>
            <tbody>
              {pinned.map((notice, index) => (
                <NoticeRow
                  key={notice.id}
                  notice={notice}
                  author={t("author")}
                  pinned
                  // 마지막 주요공지 아래 구분선은 게시판 맨 위 구분선과 동일하게(두껍게).
                  strongBottom={index === pinned.length - 1}
                  left={
                    <span className="inline-flex h-8 items-center rounded-[25px] bg-accent px-2.5 text-[12px] font-bold text-white sm:h-9 sm:px-3.5 sm:text-[13px]">
                      {t("pinnedLabel")}
                    </span>
                  }
                />
              ))}
              {rows.map(({ notice, number }) => (
                <NoticeRow
                  key={notice.id}
                  notice={notice}
                  author={t("author")}
                  left={
                    <span className="text-[16px] tabular-nums text-muted">
                      {number}
                    </span>
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isEmpty ? (
        <BoardPagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => listHref(p, query, field)}
          labels={{
            pagination: tCommon("pagination"),
            firstPage: tCommon("firstPage"),
            prevPage: tCommon("prevPage"),
            nextPage: tCommon("nextPage"),
            lastPage: tCommon("lastPage"),
          }}
        />
      ) : null}
    </main>
  );
}

// 게시판 한 행. KMI td 실측(padding 좌12/우36, 행높이, 제목 18·작성자/날짜 16, 가운데 정렬).
function NoticeRow({
  notice,
  author,
  left,
  pinned = false,
  strongBottom = false,
}: {
  notice: Notice;
  author: string;
  left: ReactNode;
  pinned?: boolean;
  strongBottom?: boolean;
}) {
  return (
    <tr
      className={`group transition-colors ${
        strongBottom
          ? "border-b-2 border-foreground/80"
          : "border-b border-line"
      } ${
        pinned ? "bg-accent-tint hover:bg-accent-tint/70" : "hover:bg-surface-2"
      }`}
    >
      <td className="h-[64px] pl-3 pr-2 text-center align-middle sm:h-[100px]">
        {left}
      </td>
      <td className="h-[64px] pl-2 pr-4 align-middle sm:h-[100px] sm:pl-3 sm:pr-9">
        <Link
          href={`/notice/${notice.id}`}
          prefetch={false}
          className="block truncate text-[16px] font-medium text-foreground transition group-hover:text-accent-strong sm:text-[18px]"
        >
          {notice.title}
        </Link>
      </td>
      <td className="hidden h-[64px] px-2 text-center align-middle text-[16px] text-muted sm:table-cell sm:h-[100px]">
        {author}
      </td>
      <td className="h-[64px] px-2 text-center align-middle text-[15px] tabular-nums text-muted sm:h-[100px] sm:text-[16px]">
        {formatDate(notice.date)}
      </td>
    </tr>
  );
}
