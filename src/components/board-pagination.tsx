import Link from "next/link";

/**
 * 공용 게시판 페이지네이션(공지·FAQ 공유). 번호 일반체 + 활성 네이비, 이전/다음은 chevron 아이콘(‹ › « »).
 * 끝에서는 화살표를 비활성(span)으로 둬 멈춤을 명시한다. buildHref로 각 페이지 URL을 만든다.
 */
export type PaginationLabels = {
  pagination: string;
  firstPage: string;
  prevPage: string;
  nextPage: string;
  lastPage: string;
};

// 현재 페이지 주변 번호 윈도우(최대 5개).
function pageWindow(current: number, total: number): number[] {
  const span = 5;
  let start = Math.max(1, current - Math.floor(span / 2));
  const end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function PagerIcon({ kind }: { kind: "first" | "prev" | "next" | "last" }) {
  const paths: Record<typeof kind, string> = {
    first: "M17 6l-6 6 6 6M11 6l-6 6 6 6",
    prev: "M15 6l-6 6 6 6",
    next: "M9 6l6 6-6 6",
    last: "M7 6l6 6-6 6M13 6l6 6-6 6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function PagerArrow({
  kind,
  disabled,
  href,
  label,
}: {
  kind: "first" | "prev" | "next" | "last";
  disabled: boolean;
  href: string;
  label: string;
}) {
  const base = "grid size-10 place-items-center rounded-lg border";
  if (disabled) {
    return (
      <span aria-hidden="true" className={`${base} border-line text-line-strong`}>
        <PagerIcon kind={kind} />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${base} border-line text-muted transition hover:border-accent hover:text-accent-strong`}
    >
      <PagerIcon kind={kind} />
    </Link>
  );
}

export function BoardPagination({
  page,
  totalPages,
  buildHref,
  labels,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  labels: PaginationLabels;
}) {
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  return (
    <nav
      aria-label={labels.pagination}
      className="mt-9 flex items-center justify-center gap-1.5"
    >
      <PagerArrow kind="first" disabled={atFirst} href={buildHref(1)} label={labels.firstPage} />
      <PagerArrow kind="prev" disabled={atFirst} href={buildHref(page - 1)} label={labels.prevPage} />

      {pageWindow(page, totalPages).map((p) =>
        p === page ? (
          <span
            key={p}
            aria-current="page"
            className="grid size-10 place-items-center rounded-lg bg-accent text-[14px] tabular-nums text-white"
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className="grid size-10 place-items-center rounded-lg border border-line text-[14px] tabular-nums text-muted transition hover:border-accent hover:text-accent-strong"
          >
            {p}
          </Link>
        ),
      )}

      <PagerArrow kind="next" disabled={atLast} href={buildHref(page + 1)} label={labels.nextPage} />
      <PagerArrow kind="last" disabled={atLast} href={buildHref(totalPages)} label={labels.lastPage} />
    </nav>
  );
}
