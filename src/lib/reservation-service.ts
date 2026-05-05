import { validateReservationDraft } from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import type { ReservationRepository } from "@/lib/reservation-repository";
import type { Gym, Reservation, ReservationDraft } from "@/types/domain";

export type CreateReservationResult =
  | {
      ok: true;
      status: "created";
      message: string;
      reservation: Reservation;
    }
  | {
      ok: false;
      status: "duplicate";
      message: string;
      reservation: Reservation;
    }
  | {
      ok: false;
      status: "rejected";
      message: string;
    };

export function createReservation({
  gym,
  draft,
  now = new Date(),
  repository = reservationRepository,
}: {
  gym: Gym;
  draft: ReservationDraft;
  now?: Date;
  repository?: ReservationRepository;
}): CreateReservationResult {
  const current = repository.read();

  if (!current.ok) {
    return {
      ok: false,
      status: "rejected",
      message: current.message,
    };
  }

  const validation = validateReservationDraft({
    gym,
    reservations: current.reservations,
    draft,
    now,
  });

  if (!validation.ok) {
    if (
      validation.reason === "duplicate-active-reservation" &&
      validation.reservation
    ) {
      return {
        ok: false,
        status: "duplicate",
        message: validation.message,
        reservation: validation.reservation,
      };
    }

    return {
      ok: false,
      status: "rejected",
      message: validation.message,
    };
  }

  const reservation = repository.build(draft);
  const writeResult = repository.replace([reservation, ...current.reservations]);

  if (!writeResult.ok) {
    return {
      ok: false,
      status: "rejected",
      message: writeResult.message,
    };
  }

  return {
    ok: true,
    status: "created",
    message: "예약이 생성되었습니다. 내 예약 화면에서 QR 입장권을 확인할 수 있습니다.",
    reservation,
  };
}
