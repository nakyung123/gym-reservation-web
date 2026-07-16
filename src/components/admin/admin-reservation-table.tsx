"use client";

import type { ReactNode } from "react";
import { formatGymPrice } from "@/lib/gym-utils";
import { formatCreatedAt } from "@/lib/admin/admin-date-format";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";
import {
  getShortId,
  statusBadgeStyles,
} from "@/components/admin/admin-reservations-shared";
import { AdminTable, AdminTd, AdminTr } from "@/components/admin/admin-ui";
import type { Gym, Reservation } from "@/types/domain";

/**
 * 예약 목록 테이블(프레젠테이션).
 *
 * 표시할 예약 목록과 선택/로딩 문맥만 받고, 상세 열기·상태 변경은 콜백/renderActions로
 * 컨테이너에 위임한다. 룩은 콘솔 표 SSOT(AdminTable)를 그대로 쓴다.
 */
type AdminReservationTableProps = {
  reservations: Reservation[];
  gymsById: Map<string, Gym>;
  selectedDetailId: string | null;
  detailLoadingId: string | null;
  onOpenDetail: (reservationId: string) => void;
  renderActions: (reservation: Reservation) => ReactNode;
};

export function AdminReservationTable({
  reservations,
  gymsById,
  selectedDetailId,
  detailLoadingId,
  onOpenDetail,
  renderActions,
}: AdminReservationTableProps) {
  return (
    <AdminTable
      minWidth="min-w-[920px]"
      columns={[
        { label: "예약번호" },
        { label: "시설 · 종목" },
        { label: "이용 일시" },
        { label: "사용자" },
        { label: "금액", align: "right" },
        { label: "상태" },
        { label: "처리", align: "right" },
      ]}
    >
      {reservations.map((reservation) => {
        const gym = gymsById.get(reservation.gymId);
        const isSelectedDetail = selectedDetailId === reservation.id;
        const isDetailLoading = detailLoadingId === reservation.id;

        return (
          <AdminTr key={reservation.id} selected={isSelectedDetail}>
            {/* 예약번호는 monospace 대신 본문 폰트 + tabular-nums로 통일한다(DESIGN.md §3). */}
            <AdminTd valign="top">
              <button
                type="button"
                onClick={() => onOpenDetail(reservation.id)}
                disabled={isDetailLoading}
                aria-pressed={isSelectedDetail}
                className="block text-left font-bold tabular-nums transition hover:text-accent-strong disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {isDetailLoading ? "여는 중" : getShortId(reservation.id)}
              </button>
              <p className="mt-0.5 text-[12px] tabular-nums text-subtle">
                {formatCreatedAt(reservation.createdAt)}
              </p>
            </AdminTd>

            <AdminTd valign="top">
              <p className="font-semibold">{gym?.name ?? "시설 정보 없음"}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {reservation.sport}
              </p>
            </AdminTd>

            <AdminTd valign="top" className="tabular-nums">
              {reservation.date} {reservation.time}
            </AdminTd>

            <AdminTd valign="top" className="max-w-44">
              <p className="truncate text-[12.5px] tabular-nums text-muted">
                {reservation.userId}
              </p>
            </AdminTd>

            <AdminTd
              valign="top"
              align="right"
              className="font-semibold tabular-nums"
            >
              {formatGymPrice(reservation.price)}
            </AdminTd>

            <AdminTd valign="top">
              <span
                className={`inline-flex h-6 items-center rounded-full border px-2 text-[11.5px] font-bold ${statusBadgeStyles[reservation.status]}`}
              >
                {reservationStatusLabel[reservation.status]}
              </span>
            </AdminTd>

            <AdminTd valign="top" align="right" className="min-w-40">
              <div className="flex justify-end">
                {renderActions(reservation)}
              </div>
            </AdminTd>
          </AdminTr>
        );
      })}
    </AdminTable>
  );
}
