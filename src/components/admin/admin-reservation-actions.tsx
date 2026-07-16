"use client";

import { Button } from "@/components/ui/app-button";
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
      <span className="text-[12.5px] font-semibold text-subtle">처리 완료</span>
    );
  }

  if (confirmCancelId === reservation.id) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <p className="text-[12.5px] font-semibold text-error">
          이 예약을 취소할까요?
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="danger"
            size="xs"
            onClick={() => onConfirmCancel(reservation)}
            disabled={!canAct}
          >
            {isCancelling ? "취소 중" : "취소 확정"}
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={onKeep}
            disabled={Boolean(actionState)}
          >
            유지
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button
        size="xs"
        onClick={() => onMarkUsed(reservation)}
        disabled={!canAct}
      >
        {isMarkingUsed ? "처리 중" : "이용 완료"}
      </Button>
      <Button
        variant="danger-outline"
        size="xs"
        onClick={() => onRequestCancel(reservation.id)}
        disabled={!canAct}
      >
        관리자 취소
      </Button>
    </div>
  );
}
