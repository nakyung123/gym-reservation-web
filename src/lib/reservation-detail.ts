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
};

const cancellationMessages: Record<
  Exclude<Reservation["status"], "reserved">,
  string
> = {
  cancelled: "이미 취소된 예약입니다.",
  used: "이미 이용 완료된 예약은 취소할 수 없습니다.",
};

// QR 체크인 팝업의 QR payload. 예약 id에서 파생한 표시용 값으로, 서버 검증 플로우는 없다
// (현장 시각 확인용 — 알려진 한계). 화면에 텍스트로 노출하지 않는다.
export function getReservationEntryCode(reservation: Pick<Reservation, "id">) {
  return reservation.id.slice(0, 10).toUpperCase();
}

export function createUserReservationDetail(
  reservation: Reservation,
  { now = new Date() }: { now?: Date } = {},
): UserReservationDetail {
  if (reservation.status !== "reserved") {
    return {
      cancellation: {
        canCancel: false,
        deadline: null,
        reason: "not-reserved",
        message: cancellationMessages[reservation.status],
      },
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
  };

  return (
    typeof detail.cancellation?.canCancel === "boolean" &&
    (typeof detail.cancellation.deadline === "string" ||
      detail.cancellation.deadline === null) &&
    isCancellationReason(detail.cancellation.reason) &&
    (typeof detail.cancellation.message === "string" ||
      detail.cancellation.message === null)
  );
}
