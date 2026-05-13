import {
  getUserReservationCancellationDeadline,
  validateUserReservationCancellation,
  type ReservationCancellationRuleFailure,
} from "@/lib/reservation-rules";
import type { Reservation } from "@/types/domain";

export type ReservationCancellationUnavailableReason =
  | ReservationCancellationRuleFailure
  | "not-reserved";

export type UserReservationDetail = {
  cancellation: {
    canCancel: boolean;
    deadline: string | null;
    reason: ReservationCancellationUnavailableReason | null;
    message: string | null;
  };
  admission: {
    active: boolean;
    entryCode: string | null;
    message: string;
  };
};

const cancellationMessages: Record<
  Exclude<Reservation["status"], "reserved">,
  string
> = {
  cancelled: "이미 취소된 예약입니다.",
  used: "이미 이용 완료된 예약은 취소할 수 없습니다.",
};

export function getReservationEntryCode(reservation: Pick<Reservation, "id">) {
  return reservation.id.slice(0, 10).toUpperCase();
}

export function createUserReservationDetail(
  reservation: Reservation,
  { now = new Date() }: { now?: Date } = {},
): UserReservationDetail {
  const admission =
    reservation.status === "reserved"
      ? {
          active: true,
          entryCode: getReservationEntryCode(reservation),
          message: "현장 확인 코드가 활성화되었습니다.",
        }
      : {
          active: false,
          entryCode: null,
          message: "예약 완료 상태의 예약만 현장 확인 코드가 활성화됩니다.",
        };

  if (reservation.status !== "reserved") {
    return {
      cancellation: {
        canCancel: false,
        deadline: null,
        reason: "not-reserved",
        message: cancellationMessages[reservation.status],
      },
      admission,
    };
  }

  const deadline = getUserReservationCancellationDeadline(reservation);
  const validation = validateUserReservationCancellation({ reservation, now });

  return {
    cancellation: {
      canCancel: validation.ok,
      deadline: deadline ? deadline.toISOString() : null,
      reason: validation.ok ? null : validation.reason,
      message: validation.ok ? null : validation.message,
    },
    admission,
  };
}

function isCancellationReason(
  value: unknown,
): value is ReservationCancellationUnavailableReason {
  return (
    value === null ||
    value === "not-reserved" ||
    value === "invalid-date-time" ||
    value === "past-time" ||
    value === "cancel-deadline-passed"
  );
}

export function isUserReservationDetail(
  value: unknown,
): value is UserReservationDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const detail = value as {
    cancellation?: {
      canCancel?: unknown;
      deadline?: unknown;
      reason?: unknown;
      message?: unknown;
    };
    admission?: {
      active?: unknown;
      entryCode?: unknown;
      message?: unknown;
    };
  };

  return (
    typeof detail.cancellation?.canCancel === "boolean" &&
    (typeof detail.cancellation.deadline === "string" ||
      detail.cancellation.deadline === null) &&
    isCancellationReason(detail.cancellation.reason) &&
    (typeof detail.cancellation.message === "string" ||
      detail.cancellation.message === null) &&
    typeof detail.admission?.active === "boolean" &&
    (typeof detail.admission.entryCode === "string" ||
      detail.admission.entryCode === null) &&
    typeof detail.admission.message === "string"
  );
}
