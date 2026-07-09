import { useMemo } from "react";

/** 목록 페이지네이션의 페이지당 항목 수 기본값. 화면별 예외는 인자로 넘긴다. */
export const DEFAULT_PER_PAGE = 10;

/**
 * 클라이언트 페이지네이션 계산 SSOT.
 *
 * totalPages 하한 1, 범위 밖 page 클램프, 현재 페이지 slice까지 한 번에 처리한다.
 * (기존에 mypage 패널 3곳 + gym-discovery가 같은 산식을 반복하던 것을 통합)
 */
export function usePagination<T>(
  items: readonly T[],
  page: number,
  perPage = DEFAULT_PER_PAGE,
) {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = items.slice(
      (currentPage - 1) * perPage,
      currentPage * perPage,
    );
    return { totalPages, currentPage, pageItems, perPage };
  }, [items, page, perPage]);
}
