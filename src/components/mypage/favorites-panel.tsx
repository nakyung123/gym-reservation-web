"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  MypageBoard,
  type BoardColumn,
  type BoardRow,
} from "@/components/mypage-board";
import { BoardPagination } from "@/components/board-pagination";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { usePagination } from "@/hooks/use-pagination";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
import type { Gym } from "@/types/domain";

/**
 * 즐겨찾기 탭: 즐겨찾기한 시설을 KMI 보드 표로 보여준다. 없으면 빈 표.
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

  // 예약횟수 집계용 예약 스냅샷. 예약내역 표와 동일한 저장소를 구독한다.
  const snapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  // 예약횟수 = 그 시설에 낸 예약 건수(상태 무관, 취소 포함).
  const bookingCountByGym = useMemo(() => {
    const map = new Map<string, number>();
    const parsed = parseReservationSnapshot(snapshot);
    if (parsed.ok) {
      for (const reservation of parsed.reservations) {
        map.set(reservation.gymId, (map.get(reservation.gymId) ?? 0) + 1);
      }
    }
    return map;
  }, [snapshot]);

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
        {t("favUsageCount", { count: bookingCountByGym.get(gym.id) ?? 0 })}
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
