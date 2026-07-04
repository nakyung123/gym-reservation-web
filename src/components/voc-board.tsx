import Link from "next/link";
import { BoardPagination } from "@/components/board-pagination";
import { VocBoardTable } from "@/components/voc-board-table";
import type { Gym, VocPost } from "@/types/domain";

// 공개 문의 게시판(고객의 소리식) 목록. 문의·FAQ '문의' 탭에서 렌더한다.
//  - 상단 파란 안내문(1400×173) + '문의 게시판' 제목(34px) + 글쓰기 버튼(120×48).
//  - 표는 VocBoardTable(클라이언트)에 위임한다. 행을 누르면 별도 페이지로 가지 않고
//    그 행 아래로 비밀번호 게이트→상세가 인라인으로 펼쳐진다.
//  - 목록/페이지네이션 골격은 공지·FAQ 게시판과 동일하게 재사용한다.

const PAGE_SIZE = 10;

export function VocBoard({
  posts,
  total,
  page,
  gyms,
  buildHref,
  paginationLabels,
}: {
  posts: VocPost[];
  total: number;
  page: number;
  gyms: Gym[];
  buildHref: (page: number) => string;
  paginationLabels: {
    pagination: string;
    firstPage: string;
    prevPage: string;
    nextPage: string;
    lastPage: string;
  };
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mt-[60px]">
      {/* 안내문 (1400×173, padding 32/40) */}
      <section className="mx-auto flex h-[173px] w-full max-w-[1400px] flex-col justify-center gap-3 rounded-2xl bg-[#eef3fc] px-10 py-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-white">
            !
          </span>
          <p className="text-[20px] font-bold text-accent-strong">
            서울체육예약은 이용자의 의견을 소중히 반영합니다.
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 pl-[34px] text-[18px] leading-snug text-slate-600">
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-accent">◦</span>
            <span>
              전달 주신 의견은 충분한 검토와 함께 향후 서비스·시스템 개선의 참고
              자료로 활용됩니다.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-accent">◦</span>
            <span>
              추가 안내가 필요한 경우, 입력하신 이메일 혹은 연락처로 안내드립니다.
            </span>
          </li>
        </ul>
      </section>

      {/* 제목 + 글쓰기 */}
      <div className="mx-auto mt-12 flex w-full max-w-[1400px] items-center justify-between">
        <h2 className="text-[34px] font-bold text-foreground">문의 게시판</h2>
        <Link
          href="/faq/inquiries/new"
          className="inline-flex h-[48px] w-[120px] items-center justify-center gap-1.5 rounded-[30px] bg-accent text-[16px] font-semibold leading-none text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          글쓰기
        </Link>
      </div>

      {/* 표: 행 클릭 시 인라인으로 펼침(클라이언트 컴포넌트) */}
      <VocBoardTable posts={posts} total={total} page={page} gyms={gyms} />

      <BoardPagination
        page={page}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={paginationLabels}
      />
    </div>
  );
}
