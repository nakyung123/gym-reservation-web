"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  MypageBoard,
  type BoardColumn,
  type BoardRow,
} from "@/components/mypage/mypage-board";
import { BoardPagination } from "@/components/ui/board-pagination";
import { ReservationQrModal } from "@/components/reservation/reservation-qr-modal";
import { reservationDisplayNumber } from "@/components/reservation/reservation-ticket";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { usePagination } from "@/hooks/use-pagination";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
import { derivePeople } from "./mypage-utils";
import type { Gym, Reservation } from "@/types/domain";

// 예약내역 표의 타원 버튼(예약 상세·QR 보기 공용). 기본 흰 배경, hover 시 네이비 채움. 117.92×40.
const RSV_PILL_CLASS =
  "inline-flex h-[40px] w-[117.92px] max-w-full items-center justify-center rounded-full border border-line-strong text-[14px] font-semibold text-foreground transition hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 예약내역 탭: 보드 표(예약번호/예약일/체육관/종목/상태/예약 상세/QR코드).
 * 예약 데이터는 reservationRepository 스냅샷을 구독해 표시한다.
 * 예약 취소는 예약 상세 페이지에서만 제공한다(목록 상태 칸은 텍스트만).
 */
export function ReservationsPanel({
  gyms,
  page,
}: {
  gyms: Gym[];
  page: number;
}) {
  const t = useTranslations("Mypage");
  const tR = useTranslations("Reservation");
  const paginationLabels = useBoardPaginationLabels();

  const snapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  const readResult = useMemo(
    () => parseReservationSnapshot(snapshot),
    [snapshot],
  );
  const reservations = useMemo(
    () => (readResult.ok ? readResult.reservations : []),
    [readResult],
  );
  const gymsById = useMemo(() => new Map(gyms.map((g) => [g.id, g])), [gyms]);
  // 최신 예약이 위로 오도록 생성일 내림차순 정렬.
  const sorted = useMemo(
    () =>
      [...reservations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reservations],
  );

  // QR 보기 클릭 시 페이지 이동 없이 띄울 QR 체크인 팝업의 대상 예약.
  // 시간 제한 없이 즉시 열고, 팝업이 10초 카운트다운 후 자동으로 닫힌다(입장 순간 노출).
  const [qrReservation, setQrReservation] = useState<Reservation | null>(null);

  const handleQrClick = (reservation: Reservation) => {
    setQrReservation(reservation);
  };

  const { totalPages, currentPage, pageItems } = usePagination(sorted, page);

  // 폭은 그리드(컨테이너) 안에 정확히 들어오도록 비율(%)로 둔다. 7칸 균등(≈1/7).
  const columns: BoardColumn[] = [
    { label: t("rsvColNumber"), width: "w-[14.285%]" },
    { label: t("rsvColDate"), width: "w-[14.285%]", hideOnMobile: true },
    { label: t("rsvColGym"), width: "w-[14.285%]" },
    { label: t("rsvColSport"), width: "w-[14.285%]", hideOnMobile: true },
    { label: t("rsvColStatus"), width: "w-[14.285%]" },
    { label: t("rsvColDetail"), width: "w-[14.285%]" },
    // QR 체크인은 모바일에서 자주 쓰는 핵심 동작이라 모바일에서도 노출한다.
    { label: t("rsvColQr"), width: "w-[14.285%]" },
  ];

  const rows: BoardRow[] = pageItems.map((reservation: Reservation) => {
    const gym = gymsById.get(reservation.gymId);
    const gymName = gym?.name ?? t("rsvMissingGym");
    // 자세히 보기는 예약 상세 페이지로 같은 탭에서 이동한다(사이트 헤더/푸터 유지).
    const detailHref = `/reservations/${encodeURIComponent(reservation.id)}/detail`;
    return {
      key: reservation.id,
      cells: [
        <span key="no" className="tabular-nums text-foreground">
          {reservationDisplayNumber(reservation)}
        </span>,
        <span key="date" className="tabular-nums text-foreground">
          {reservation.date}
        </span>,
        <span key="gym" className="block truncate text-foreground">
          {gymName}
        </span>,
        <span key="sport" className="text-foreground">
          {reservation.sport}
        </span>,
        <span key="status" className="text-foreground">
          {tR(`status.${reservation.status}`)}
        </span>,
        <Link key="detail" href={detailHref} className={RSV_PILL_CLASS}>
          {t("rsvDetailLink")}
        </Link>,
        reservation.status === "reserved" ? (
          <button
            key="qr"
            type="button"
            onClick={() => handleQrClick(reservation)}
            aria-label={t("rsvQrAria")}
            className={RSV_PILL_CLASS}
          >
            {t("rsvQrLink")}
          </button>
        ) : (
          <span key="qr" className="text-subtle">
            -
          </span>
        ),
      ],
    };
  });

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (target > 1) params.set("resvPage", String(target));
    const query = params.toString();
    return query ? `/mypage?${query}` : "/mypage";
  };

  return (
    <section className="w-full">
      <MypageBoard
        columns={columns}
        rows={rows}
        emptyMessage={t("reservationsEmpty")}
        cellHeightClass="h-[81px]"
      />
      <BoardPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildHref}
        labels={paginationLabels}
      />
      {qrReservation ? (
        <ReservationQrModal
          reservation={qrReservation}
          gymName={
            gymsById.get(qrReservation.gymId)?.name ?? t("rsvMissingGym")
          }
          people={derivePeople(gymsById.get(qrReservation.gymId), qrReservation)}
          onClose={() => setQrReservation(null)}
        />
      ) : null}
    </section>
  );
}
