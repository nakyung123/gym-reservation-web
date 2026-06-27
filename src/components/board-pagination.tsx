import Link from "next/link";

/**
 * 공용 게시판 페이지네이션. 번호 일반체 + 활성 네이비, 이전/다음은 chevron 아이콘(‹ › « »).
 * 끝에서는 화살표를 비활성(span)으로 둬 멈춤을 명시한다.
 *
 * 두 가지 모드를 같은 UI로 재사용한다(둘 중 하나만 전달).
 * - buildHref: 공지·FAQ처럼 URL 쿼리(?page=) 기반. 각 페이지를 Link로 이동.
 * - onNavigate: /gyms처럼 클라이언트 state 필터 위에서 page만 바꿀 때. button으로 콜백 호출.
 */
export type PaginationLabels = {
  pagination: string;
  firstPage: string;
  prevPage: string;
  nextPage: string;
  lastPage: string;
};

type PagerKind = "first" | "prev" | "next" | "last";

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

function PagerIcon({ kind }: { kind: PagerKind }) {
  const paths: Record<PagerKind, string> = {
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

const ARROW_BASE = "grid size-10 place-items-center rounded-lg border";
const ARROW_ACTIVE = `${ARROW_BASE} border-line text-muted transition hover:border-accent hover:text-accent-strong`;
const NUMBER_BASE =
  "grid size-10 place-items-center rounded-lg border border-line text-[14px] tabular-nums text-muted transition hover:border-accent hover:text-accent-strong";

function PagerArrow({
  kind,
  disabled,
  targetPage,
  href,
  onNavigate,
  label,
}: {
  kind: PagerKind;
  disabled: boolean;
  targetPage: number;
  href: string;
  onNavigate?: (page: number) => void;
  label: string;
}) {
  if (disabled) {
    return (
      <span aria-hidden="true" className={`${ARROW_BASE} border-line text-line-strong`}>
        <PagerIcon kind={kind} />
      </span>
    );
  }
  if (onNavigate) {
    return (
      <button type="button" onClick={() => onNavigate(targetPage)} aria-label={label} className={ARROW_ACTIVE}>
        <PagerIcon kind={kind} />
      </button>
    );
  }
  return (
    <Link href={href} aria-label={label} className={ARROW_ACTIVE}>
      <PagerIcon kind={kind} />
    </Link>
  );
}

export function BoardPagination({
  page,
  totalPages,
  buildHref,
  onNavigate,
  labels,
}: {
  page: number;
  totalPages: number;
  buildHref?: (page: number) => string;
  onNavigate?: (page: number) => void;
  labels: PaginationLabels;
}) {
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  const hrefFor = (p: number) => (buildHref ? buildHref(p) : "#");

  return (
    <nav
      aria-label={labels.pagination}
      className="mt-9 flex items-center justify-center gap-1.5"
    >
      <PagerArrow kind="first" disabled={atFirst} targetPage={1} href={hrefFor(1)} onNavigate={onNavigate} label={labels.firstPage} />
      <PagerArrow kind="prev" disabled={atFirst} targetPage={page - 1} href={hrefFor(page - 1)} onNavigate={onNavigate} label={labels.prevPage} />

      {pageWindow(page, totalPages).map((p) =>
        p === page ? (
          <span
            key={p}
            aria-current="page"
            className="grid size-10 place-items-center rounded-lg bg-accent text-[14px] tabular-nums text-white"
          >
            {p}
          </span>
        ) : onNavigate ? (
          <button key={p} type="button" onClick={() => onNavigate(p)} className={NUMBER_BASE}>
            {p}
          </button>
        ) : (
          <Link key={p} href={hrefFor(p)} className={NUMBER_BASE}>
            {p}
          </Link>
        ),
      )}

      <PagerArrow kind="next" disabled={atLast} targetPage={page + 1} href={hrefFor(page + 1)} onNavigate={onNavigate} label={labels.nextPage} />
      <PagerArrow kind="last" disabled={atLast} targetPage={totalPages} href={hrefFor(totalPages)} onNavigate={onNavigate} label={labels.lastPage} />
    </nav>
  );
}
