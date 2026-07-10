"use client";

import type { ReactNode } from "react";
import { formatGymPrice } from "@/lib/gym-utils";
import { formatCreatedAt } from "@/lib/admin/admin-date-format";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";
import {
  getShortId,
  statusBadgeStyles,
} from "@/components/admin/admin-reservations-shared";
import type { Gym, Reservation } from "@/types/domain";

/**
 * 예약 목록 테이블(프레젠테이션).
 *
 * 표시할 예약 목록과 선택/로딩 문맥만 받고, 상세 열기·상태 변경은 콜백/renderActions로
 * 컨테이너에 위임한다. 상태 변경 버튼은 상세 패널과 동일하게 renderActions로 렌더한다.
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
    <div className="mt-4 overflow-x-auto">
      {/* 모바일에서는 폭이 좁아 break-all이 사용자 ID를 1자씩 세로로 떨어뜨린다.
          min-w로 좁은 viewport는 가로 스크롤로 풀리게 하고, w-full로 넓은
          viewport에서는 카드 폭을 그대로 채운다. */}
      <table className="w-full min-w-[800px] border-collapse text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="border-b border-line px-3 py-2 text-left">예약</th>
            <th className="border-b border-line px-3 py-2 text-left">시설</th>
            <th className="border-b border-line px-3 py-2 text-left">
              이용 일시
            </th>
            <th className="border-b border-line px-3 py-2 text-left">
              사용자
            </th>
            <th className="border-b border-line px-3 py-2 text-left">결제</th>
            <th className="border-b border-line px-3 py-2 text-left">상태</th>
            <th className="border-b border-line px-3 py-2 text-left">처리</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((reservation) => {
            const gym = gymsById.get(reservation.gymId);
            const isSelectedDetail = selectedDetailId === reservation.id;
            const isDetailLoading = detailLoadingId === reservation.id;

            return (
              <tr
                key={reservation.id}
                className={`border-b border-line align-top ${
                  isSelectedDetail ? "bg-accent-tint" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <p className="font-mono text-xs font-bold text-slate-950">
                    {getShortId(reservation.id)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCreatedAt(reservation.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenDetail(reservation.id)}
                    disabled={isDetailLoading}
                    className="mt-2 inline-flex h-7 items-center rounded-md border border-line-strong bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    aria-pressed={isSelectedDetail}
                  >
                    {isDetailLoading ? "여는 중" : "상세"}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-950">
                    {gym?.name ?? "시설 정보 없음"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {reservation.gymId}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-950">
                    {reservation.date} {reservation.time}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {reservation.sport}
                  </p>
                </td>
                <td className="max-w-52 px-3 py-3">
                  <p className="break-all font-mono text-xs text-slate-700">
                    {reservation.userId}
                  </p>
                </td>
                <td className="px-3 py-3 font-semibold text-slate-950">
                  {formatGymPrice(reservation.price)}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${statusBadgeStyles[reservation.status]}`}
                  >
                    {reservationStatusLabel[reservation.status]}
                  </span>
                </td>
                <td className="min-w-44 px-3 py-3">
                  {renderActions(reservation)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
