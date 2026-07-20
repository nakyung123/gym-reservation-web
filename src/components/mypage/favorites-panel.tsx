"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  MypageBoard,
  type BoardColumn,
  type BoardRow,
} from "@/components/mypage/mypage-board";
import { BoardPagination } from "@/components/ui/board-pagination";
import { useUserSummary } from "@/hooks/use-user-summary";
import { usePagination } from "@/hooks/use-pagination";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
import type { Gym } from "@/types/domain";

/**
 * 즐겨찾기 탭: 즐겨찾기한 시설을 보드 표로 보여준다. 없으면 빈 표.
 * 즐겨찾기 로드 실패(loadError)는 표 위 alert 배너로 명시한다(No Silent Fallback).
 */
export function FavoritesPanel({
  gyms,
  favorites,
  loadError,
  page,
}: {
  gyms: Gym[];
  favorites: ReadonlySet<string>;
  loadError: string | null;
  page: number;
}) {
  const t = useTranslations("Mypage");
  const paginationLabels = useBoardPaginationLabels();

  // 예약횟수 = 그 시설에 낸 예약 건수(상태 무관, 취소 포함).
  //
  // 예전에는 예약 목록 스냅샷 전체를 구독해 클라이언트에서 셌다. 그러면 이 표를 그리려고
  // 사용자의 전 기간 예약을 다 받아야 해서 누적 예약에 비례해 비용이 커진다.
  // 지금은 서버 집계(GET /api/me)를 받는다 — 응답 크기가 시설 수로 제한된다.
  const { summary } = useUserSummary();
  const bookingCountByGym = useMemo(
    () => summary?.reservationCountByGym ?? {},
    [summary],
  );

  const favoritedGyms = useMemo(
    () =>
      gyms
        .filter((gym) => favorites.has(gym.id))
        .sort((left, right) => left.name.localeCompare(right.name, "ko")),
    [gyms, favorites],
  );

  const { totalPages, currentPage, pageItems, perPage } = usePagination(
    favoritedGyms,
    page,
  );

  // 종목이 여러 개면 줄바꿈으로 행 높이가 커지므로 시설명 폭을 줄이고 종목 폭을 넓혀 밸런스를 맞춘다.
  const columns: BoardColumn[] = [
    { label: t("favColNumber"), width: "w-[10%]" },
    { label: t("favColName"), width: "w-[40%]" },
    { label: t("favColRegion"), width: "w-[16%]", hideOnMobile: true },
    { label: t("favColSports"), width: "w-[22%]", hideOnMobile: true },
    { label: t("favColUsage"), width: "w-[12%]" },
  ];

  const rows: BoardRow[] = pageItems.map((gym, index) => ({
    key: gym.id,
    cells: [
      <span key="no" className="tabular-nums text-muted">
        {(currentPage - 1) * perPage + index + 1}
      </span>,
      <Link
        key="name"
        href={`/gyms/${gym.id}`}
        className="font-medium text-foreground transition hover:text-accent-strong"
      >
        {gym.name}
      </Link>,
      <span key="region" className="text-foreground">
        {gym.region}
      </span>,
      <span key="sports" className="text-foreground">
        {gym.sports.join(", ")}
      </span>,
      <span key="usage" className="tabular-nums text-foreground">
        {t("favUsageCount", { count: bookingCountByGym[gym.id] ?? 0 })}
      </span>,
    ],
  }));

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    params.set("tab", "favorites");
    if (target > 1) params.set("favPage", String(target));
    return `/mypage?${params.toString()}`;
  };

  return (
    <section className="w-full">
      {loadError ? (
        <div
          className="mb-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
          role="alert"
        >
          {t("favLoadError")}
        </div>
      ) : null}
      <MypageBoard
        columns={columns}
        rows={rows}
        emptyMessage={t("favoritesEmpty")}
        cellHeightClass="h-[81px]"
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
