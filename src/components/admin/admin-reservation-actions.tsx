"use client";

import type { Reservation } from "@/types/domain";
import type { ActionState } from "@/components/admin/admin-reservations-shared";

/**
 * 예약 행/상세에서 공용으로 쓰는 상태 변경 액션 버튼.
 *
 * 진행 중 액션(actionState)·취소 확인 대기(confirmCancelId)는 컨테이너가 소유하고
 * prop으로 내려받는다. 이 컴포넌트는 그 값으로 버튼 표현만 결정한다(No 로직 소유).
 * 테이블 행과 상세 패널이 완전히 같은 표현을 쓰도록 한 곳에 모은다.
 */
type AdminReservationActionsProps = {
  reservation: Reservation;
  actionState: ActionState | null;
  confirmCancelId: string | null;
  onMarkUsed: (reservation: Reservation) => void;
  onRequestCancel: (reservationId: string) => void;
  onConfirmCancel: (reservation: Reservation) => void;
  onKeep: () => void;
};

export function AdminReservationActions({
  reservation,
  actionState,
  confirmCancelId,
  onMarkUsed,
  onRequestCancel,
  onConfirmCancel,
  onKeep,
}: AdminReservationActionsProps) {
  const actionIsPending = actionState?.reservationId === reservation.id;
  const isCancelling =
    actionIsPending && actionState?.nextStatus === "cancelled";
  const isMarkingUsed = actionIsPending && actionState?.nextStatus === "used";
  const canAct = reservation.status === "reserved" && !actionState;

  if (reservation.status !== "reserved") {
    return (
      <span className="text-xs font-semibold text-slate-400">처리 완료</span>
    );
  }

  if (confirmCancelId === reservation.id) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-error">
          이 예약을 취소할까요?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirmCancel(reservation)}
            disabled={!canAct}
            className="h-8 rounded-md bg-error px-3 text-xs font-semibold text-white transition hover:bg-error/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {isCancelling ? "취소 중" : "취소 확정"}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={Boolean(actionState)}
            className="h-8 rounded-md border border-line-strong px-3 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            유지
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onMarkUsed(reservation)}
        disabled={!canAct}
        className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {isMarkingUsed ? "처리 중" : "이용 완료"}
      </button>
      <button
        type="button"
        onClick={() => onRequestCancel(reservation.id)}
        disabled={!canAct}
        className="h-8 rounded-md border border-error/30 px-3 text-xs font-semibold text-error transition hover:bg-error/10 disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        관리자 취소
      </button>
    </div>
  );
}
