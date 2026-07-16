"use client";

import type { ReactNode } from "react";
import { formatGymPrice } from "@/lib/gym-utils";
import { formatCreatedAt } from "@/lib/admin/admin-date-format";
import {
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
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
    <section className="rounded-xl border border-accent/20 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">
            선택된 예약 상세
          </h2>
          {detailState.status === "loading" ? (
            <p
              className="mt-1 flex items-center gap-2 text-[13px] text-muted"
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
              className="mt-1 break-all text-[13px] tabular-nums text-muted"
              aria-label="요청한 예약 ID"
            >
              {detailState.reservationId}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={onClose}
          disabled={closeDisabled}
        >
          닫기
        </Button>
      </div>

      {detailState.status === "error" ? (
        <div className="mt-4">
          <AdminErrorNotice message={detailState.message} />
        </div>
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
          className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-[13.5px] font-semibold text-warning"
          role="status"
        >
          <p className="leading-relaxed">
            이 예약은 현재 검색어에 일치하지 않아 아래 표에서 숨겨졌습니다. 상세
            정보는 그대로 유지됩니다.
          </p>
          <button
            type="button"
            onClick={onClearSearch}
            aria-label="검색어 지우기"
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-warning/40 bg-white px-3.5 text-[14.5px] font-bold text-warning transition hover:border-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            검색어 지우기
          </button>
        </div>
      ) : null}

      {detailState.status === "ready" ? (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* 식별자는 monospace 대신 본문 폰트 + tabular로 통일한다(DESIGN.md §3). */}
            <DetailField label="예약번호">
              <span className="break-all tabular-nums">
                {detailState.reservation.id}
              </span>
            </DetailField>
            <DetailField label="사용자 ID">
              <span className="break-all tabular-nums">
                {detailState.reservation.userId}
              </span>
            </DetailField>
            <DetailField label="시설">
              <span className="font-semibold">
                {gymsById.get(detailState.reservation.gymId)?.name ??
                  "시설 정보 없음"}
              </span>
              <span className="mt-1 block text-[13px] text-muted">
                {detailState.reservation.gymId}
              </span>
            </DetailField>
            <DetailField label="종목">
              <span className="font-semibold">
                {detailState.reservation.sport}
              </span>
            </DetailField>
            <DetailField label="이용 일시">
              <span className="font-semibold tabular-nums">
                {detailState.reservation.date} {detailState.reservation.time}
              </span>
            </DetailField>
            <DetailField label="금액">
              <span className="font-semibold tabular-nums">
                {formatGymPrice(detailState.reservation.price)}
              </span>
            </DetailField>
            <DetailField label="상태">
              <span
                className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[12.5px] font-bold ${statusBadgeStyles[detailState.reservation.status]}`}
              >
                {reservationStatusLabel[detailState.reservation.status]}
              </span>
            </DetailField>
            <DetailField label="생성일">
              <span className="tabular-nums">
                {formatCreatedAt(detailState.reservation.createdAt)}
              </span>
            </DetailField>
          </div>
          <div className="mt-5 border-t border-line pt-5">
            {renderActions(detailState.reservation)}
          </div>
        </>
      ) : null}
    </section>
  );
}

// 상세 필드 한 칸. 라벨은 폼 필드 라벨과 같은 12.5px bold, 값은 본문 15px.
function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={ADMIN_FIELD_LABEL_CLASS}>{label}</p>
      <p className="mt-1.5 text-[13.5px] text-foreground">{children}</p>
    </div>
  );
}
