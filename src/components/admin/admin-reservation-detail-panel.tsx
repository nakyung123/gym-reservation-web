"use client";

import type { ReactNode } from "react";
import { formatGymPrice } from "@/lib/gym-utils";
import { formatCreatedAt } from "@/lib/admin/admin-date-format";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";
import {
  statusBadgeStyles,
  type DetailState,
} from "@/components/admin/admin-reservations-shared";
import type { Gym, Reservation } from "@/types/domain";

/**
 * 선택된 예약 상세 패널(프레젠테이션).
 *
 * 상세 상태머신(detailState)과 목록 검색 문맥(searchInput/visibleReservations)을
 * 컨테이너로부터 받아 표시만 한다. 상세/닫기/검색해제 동작은 콜백으로 위임하고,
 * 상태 변경 버튼은 컨테이너의 renderActions를 그대로 렌더한다(행과 동일 표현 보장).
 */
type AdminReservationDetailPanelProps = {
  detailState: DetailState;
  gymsById: Map<string, Gym>;
  searchInput: string;
  visibleReservations: Reservation[];
  closeDisabled: boolean;
  onClose: () => void;
  onClearSearch: () => void;
  renderActions: (reservation: Reservation) => ReactNode;
};

export function AdminReservationDetailPanel({
  detailState,
  gymsById,
  searchInput,
  visibleReservations,
  closeDisabled,
  onClose,
  onClearSearch,
  renderActions,
}: AdminReservationDetailPanelProps) {
  if (detailState.status === "idle") {
    return null;
  }

  return (
    <section className="rounded-lg border border-accent/20 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">
            선택된 예약 상세
          </h2>
          {detailState.status === "loading" ? (
            <p
              className="mt-1 flex items-center gap-2 text-xs text-slate-500"
              aria-live="polite"
              aria-busy="true"
            >
              <span
                className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
                aria-hidden="true"
              />
              페이지를 불러오는 중입니다.
            </p>
          ) : null}
          {detailState.status === "error" ? (
            <p
              className="mt-1 break-all font-mono text-xs text-slate-500"
              aria-label="요청한 예약 ID"
            >
              {detailState.reservationId}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          className="h-8 rounded-md border border-line-strong bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          닫기
        </button>
      </div>

      {detailState.status === "error" ? (
        <p
          className="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm font-semibold text-error"
          role="alert"
        >
          {detailState.message}
        </p>
      ) : null}

      {/* 검색어가 적용된 상태에서 상세에 떠 있는 예약이 목록(visibleReservations)에
          포함되지 않으면 사용자가 행을 못 보고 상세만 떠 있는 상황이 된다. 데이터는
          안전하게 유지하되, 그 사실을 명시하고 검색어를 한 번에 풀 수 있는 CTA를
          같이 둔다. detailState가 ready 상태에서만 의미. */}
      {detailState.status === "ready" &&
      searchInput.trim() &&
      !visibleReservations.some(
        (reservation) => reservation.id === detailState.reservation.id,
      ) ? (
        <div
          className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs font-semibold text-warning"
          role="status"
        >
          <p>
            이 예약은 현재 검색어에 일치하지 않아 아래 표에서 숨겨졌습니다. 상세
            정보는 그대로 유지됩니다.
          </p>
          <button
            type="button"
            onClick={onClearSearch}
            aria-label="검색어 지우기"
            className="mt-2 inline-flex h-7 items-center rounded-md border border-warning/40 bg-white px-2 text-xs font-semibold text-warning transition hover:border-warning hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            검색어 지우기
          </button>
        </div>
      ) : null}

      {detailState.status === "ready" ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-600">예약번호</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">
                {detailState.reservation.id}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">
                사용자 ID
              </p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">
                {detailState.reservation.userId}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">시설</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {gymsById.get(detailState.reservation.gymId)?.name ??
                  "시설 정보 없음"}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {detailState.reservation.gymId}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">종목</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {detailState.reservation.sport}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">
                이용 일시
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {detailState.reservation.date}{" "}
                {detailState.reservation.time}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">금액</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatGymPrice(detailState.reservation.price)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">상태</p>
              <p className="mt-1">
                <span
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${statusBadgeStyles[detailState.reservation.status]}`}
                >
                  {reservationStatusLabel[detailState.reservation.status]}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">생성일</p>
              <p className="mt-1 text-sm text-slate-900">
                {formatCreatedAt(detailState.reservation.createdAt)}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            {renderActions(detailState.reservation)}
          </div>
        </>
      ) : null}
    </section>
  );
}
