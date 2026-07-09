"use client";

import { useTranslations } from "next-intl";
import { BoardPagination } from "@/components/board-pagination";
import { MypageInquiriesTable } from "@/components/mypage-inquiries-table";
import { fetchMyVocPosts } from "@/lib/voc-client";
import { useAbortableFetch } from "@/hooks/use-abortable-fetch";
import { DEFAULT_PER_PAGE } from "@/hooks/use-pagination";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
import type { Gym, VocPost } from "@/types/domain";

/**
 * 문의 내역 탭: 로그인 사용자가 공개 문의 게시판(문의·FAQ)에 등록한 글을
 * 예약/즐겨찾기 내역과 동일한 표로 보여준다. 작성은 공개 게시판에서 하므로
 * 여기엔 '문의하기' 버튼이 없다. 행을 누르면 그 아래로 체육관/카테고리/답변이
 * 펼쳐진다(표 구현은 MypageInquiriesTable).
 *
 * 목록은 서버 페이지네이션(total 기반)이라 usePagination 대신 total로 계산한다.
 */
export function InquiriesPanel({ gyms, page }: { gyms: Gym[]; page: number }) {
  const t = useTranslations("Mypage");
  const paginationLabels = useBoardPaginationLabels();

  const state = useAbortableFetch<{ posts: VocPost[]; total: number }>(
    (signal) => fetchMyVocPosts(page, signal),
    [page],
  );

  const posts = state.status === "ready" ? state.data.posts : [];
  const total = state.status === "ready" ? state.data.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PER_PAGE));
  const currentPage = Math.min(page, totalPages);

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    params.set("tab", "inquiries");
    if (target > 1) params.set("inqPage", String(target));
    return `/mypage?${params.toString()}`;
  };

  // 표가 빈 이유를 상태별로 구분해 안내한다(로딩/오류/실제 빈 목록).
  const emptyMessage =
    state.status === "loading"
      ? t("inqLoading")
      : state.status === "error"
        ? state.message
        : t("inquiriesEmpty");

  return (
    <section className="w-full">
      <MypageInquiriesTable
        posts={posts}
        gyms={gyms}
        total={total}
        page={currentPage}
        emptyMessage={emptyMessage}
      />
      <BoardPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={paginationLabels}
      />
    </section>
  );
}
