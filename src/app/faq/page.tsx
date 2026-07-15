import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BoardPagination } from "@/components/ui/board-pagination";
import { SearchBar } from "@/components/home/search-bar";
import { VocBoard } from "@/components/voc/voc-board";
import { FAQ_KNOWLEDGE } from "@/lib/server/faq-knowledge";
import { listVocPosts } from "@/lib/server/db-voc-repository";
import { gymRepository } from "@/lib/gym-repository-provider";

// 문의·FAQ = FAQ 지식 SSOT(faq-knowledge.ts)를 아코디언 FAQ로 보여준다.
//  - 상단 카테고리 탭(가입·계정/예약·취소/결제·환불/문의) — 활성 네이비 밑줄.
//  - 검색바: 공용 SearchBar([전체/제목/내용] 드롭다운 + 키워드). 활성 탭은 hidden cat으로 보존.
//  - 본문: Q 배지 아코디언(질문 22px, 펼치면 A + 답변, 배경 accent-tint). 토글은 JS 없이 <details>.
//  - 페이지네이션은 공용 BoardPagination(공지와 공유). 필터/페이지는 URL 쿼리(?cat=&field=&q=&page=).
// FAQ 봇과 동일 출처(faq-knowledge.ts)를 재사용한다(SSOT 단일). 카테고리 그룹핑은 화면에서만 한다.

export const metadata: Metadata = {
  title: "문의·FAQ — 서울체육예약",
  description: "가입·예약·취소·이용 방법 등 자주 묻는 질문을 안내합니다.",
};

const PER_PAGE = 5;

// FAQ_KNOWLEDGE의 7개 카테고리를 4개 탭으로 묶는다(데이터는 그대로, 화면 그룹핑만).
const TAB_GROUPS: { key: string; label: string; categories: string[] }[] = [
  { key: "signup", label: "가입·계정", categories: ["가입 / 계정"] },
  {
    key: "reservation",
    label: "예약·취소",
    categories: ["예약", "예약 변경·취소", "체크인 / 입장"],
  },
  { key: "payment", label: "결제·환불", categories: ["결제", "환불"] },
  { key: "support", label: "문의", categories: ["고객센터 / 문의"] },
];

const SEARCH_FIELDS = ["all", "title", "content"] as const;

// cat/field/q/page를 보존한 FAQ URL.
function faqHref(opts: {
  cat: string;
  field: string;
  q: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (opts.cat) params.set("cat", opts.cat);
  if (opts.field && opts.field !== "all") params.set("field", opts.field);
  if (opts.q) params.set("q", opts.q);
  if (opts.page > 1) params.set("page", String(opts.page));
  const query = params.toString();
  return query ? `/faq?${query}` : "/faq";
}

type SearchParams = Promise<{
  cat?: string;
  field?: string;
  q?: string;
  page?: string;
}>;

export default async function FaqPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations("Faq");
  // 페이지네이션 라벨은 게시판 공용이라 Notice 네임스페이스를 재사용한다.
  const tCommon = await getTranslations("Common");
  const {
    cat: catParam,
    field: fieldParam,
    q: qParam,
    page: pageParam,
  } = await searchParams;

  const activeKey = TAB_GROUPS.some((group) => group.key === catParam)
    ? (catParam as string)
    : TAB_GROUPS[0].key;
  const activeGroup =
    TAB_GROUPS.find((group) => group.key === activeKey) ?? TAB_GROUPS[0];
  const field = SEARCH_FIELDS.includes(
    (fieldParam ?? "") as (typeof SEARCH_FIELDS)[number],
  )
    ? (fieldParam as string)
    : "all";
  const query = (qParam ?? "").trim();

  // '문의' 탭은 FAQ 아코디언 대신 공개 문의 게시판(고객의 소리식)을 보여준다.
  const isSupport = activeKey === "support";
  const requestedPage = Math.max(
    1,
    Number.isNaN(Number.parseInt(pageParam ?? "1", 10))
      ? 1
      : Number.parseInt(pageParam ?? "1", 10),
  );

  // 검색어가 없으면 활성 탭의 카테고리만, 검색어가 있으면 FAQ 전체에서 찾는다
  // (다른 탭에 있는 답을 0건으로 놓치지 않게). 전체 검색 결과에는 탭 라벨 배지를 붙인다.
  const entryMatches = (entry: { q: string; a: string }) => {
    if (field === "title") return entry.q.includes(query);
    if (field === "content") return entry.a.includes(query);
    return entry.q.includes(query) || entry.a.includes(query);
  };
  const matched: { entry: { q: string; a: string }; groupLabel: string | null }[] =
    query
      ? TAB_GROUPS.flatMap((group) =>
          FAQ_KNOWLEDGE.filter((category) =>
            group.categories.includes(category.title),
          ).flatMap((category) =>
            category.entries
              .filter(entryMatches)
              .map((entry) => ({ entry, groupLabel: group.label })),
          ),
        )
      : FAQ_KNOWLEDGE.filter((category) =>
          activeGroup.categories.includes(category.title),
        )
          .flatMap((category) => category.entries)
          .map((entry) => ({ entry, groupLabel: null }));

  const totalPages = Math.max(1, Math.ceil(matched.length / PER_PAGE));
  const requested = Number.parseInt(pageParam ?? "1", 10);
  const page = Math.min(
    Math.max(1, Number.isNaN(requested) ? 1 : requested),
    totalPages,
  );
  const pageItems = matched.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // 문의 게시판 데이터(문의 탭에서만 사용). 페이지네이션 라벨은 게시판 공용(Notice) 재사용.
  const voc = isSupport
    ? await listVocPosts({ page: requestedPage })
    : { posts: [], total: 0 };
  const vocGyms = isSupport ? await gymRepository.list() : [];
  const paginationLabels = {
    pagination: tCommon("pagination"),
    firstPage: tCommon("firstPage"),
    prevPage: tCommon("prevPage"),
    nextPage: tCommon("nextPage"),
    lastPage: tCommon("lastPage"),
  };

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

      {/* 카테고리 탭 (활성 네이비 + 밑줄). 하단 구분선은 양쪽 화면 끝까지(full-bleed). */}
      <div className="relative isolate mt-8">
        <nav
          aria-label={t("title")}
          className="grid grid-cols-2 sm:grid-cols-4"
        >
          {TAB_GROUPS.map((group) => {
            const active = group.key === activeKey;
            return (
              <Link
                key={group.key}
                href={faqHref({ cat: group.key, field: "all", q: "", page: 1 })}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 py-4 text-center text-[18px] transition sm:text-[22px] ${
                  active
                    ? "border-accent font-bold text-accent-strong"
                    : "border-transparent font-medium text-muted hover:text-foreground"
                }`}
              >
                {group.label}
              </Link>
            );
          })}
        </nav>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[calc(50%_-_50vw)] -z-10 h-px w-screen bg-line"
        />
      </div>

      {isSupport ? (
        <VocBoard
          posts={voc.posts}
          total={voc.total}
          page={requestedPage}
          gyms={vocGyms}
          buildHref={(p) => faqHref({ cat: activeKey, field: "all", q: "", page: p })}
          paginationLabels={paginationLabels}
        />
      ) : (
        <>
      {/* 검색바 (공용 SearchBar: [전체/제목/내용] 드롭다운 + 키워드). 위·아래 60px */}
      <div className="mt-[60px]">
        <SearchBar
          action="/faq"
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
          hidden={{ cat: activeKey }}
        />
      </div>

      {/* 아코디언 (Q 배지 + 질문 22px, 펼치면 A + 답변) */}
      <div className="mt-[60px] border-t border-foreground">
        {pageItems.length === 0 ? (
          <p className="pt-[50px] pb-20 text-center text-[15px] text-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul>
            {pageItems.map(({ entry, groupLabel }) => (
              <li key={entry.q} className="border-b border-line">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-2 py-6 sm:gap-5 sm:px-10 sm:py-7">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-white">
                      Q
                    </span>
                    <span className="flex-1 text-[18px] font-medium text-foreground sm:text-[22px]">
                      {entry.q}
                      {groupLabel ? (
                        <span className="ml-3 inline-block align-middle rounded-full bg-accent-tint px-3 py-0.5 text-[13px] font-semibold text-accent-strong">
                          {groupLabel}
                        </span>
                      ) : null}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="size-6 shrink-0 text-foreground transition-transform group-open:rotate-180"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="flex items-start gap-4 bg-accent-tint px-2 py-6 sm:gap-5 sm:px-10 sm:py-7">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-white">
                      A
                    </span>
                    <p className="flex-1 whitespace-pre-line pt-1 text-[15px] leading-relaxed text-foreground sm:text-[16px]">
                      {entry.a}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pageItems.length > 0 ? (
        <BoardPagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) =>
            faqHref({ cat: activeKey, field, q: query, page: p })
          }
          labels={{
            pagination: tCommon("pagination"),
            firstPage: tCommon("firstPage"),
            prevPage: tCommon("prevPage"),
            nextPage: tCommon("nextPage"),
            lastPage: tCommon("lastPage"),
          }}
        />
      ) : null}
        </>
      )}
    </main>
  );
}
