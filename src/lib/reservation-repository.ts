import type { Reservation, ReservationDraft } from "@/types/domain";

export const EMPTY_RESERVATION_SNAPSHOT = "[]";

export type ReservationRepositoryFailure =
  | {
      ok: false;
      reason: "storage-unavailable";
      message: string;
    }
  | {
      ok: false;
      reason: "invalid-storage-data";
      message: string;
    };

export type ReservationReadResult =
  | {
      ok: true;
      reservations: Reservation[];
    }
  | ReservationRepositoryFailure;

export type ReservationWriteResult =
  | {
      ok: true;
      reservations: Reservation[];
    }
  | ReservationRepositoryFailure;

export type ReservationCancelResult =
  | {
      ok: true;
      status: "cancelled" | "unchanged";
      message: string;
      reservation: Reservation;
      reservations: Reservation[];
    }
  | {
      ok: false;
      status: "not-found" | "not-cancellable";
      message: string;
      reservation?: Reservation;
      reservations: Reservation[];
    }
  | {
      ok: false;
      status: "failed";
      message: string;
      reason: ReservationRepositoryFailure["reason"];
    };

export type ReservationRepository = {
  read(): ReservationReadResult;
  replace(reservations: Reservation[]): ReservationWriteResult;
  build(draft: ReservationDraft): Reservation;
  cancel(reservationId: string): ReservationCancelResult;
  getSnapshot(): string;
  subscribe(listener: () => void): () => void;
};

export function invalidReservationData(): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "invalid-storage-data",
    message:
      "저장된 예약 데이터 형식이 올바르지 않습니다. 예약 목록을 확인할 수 없습니다.",
  };
}

function isReservation(value: unknown): value is Reservation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Reservation>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.gymId === "string" &&
    typeof candidate.sport === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.price === "number" &&
    Number.isFinite(candidate.price) &&
    (candidate.status === "reserved" ||
      candidate.status === "cancelled" ||
      candidate.status === "used") &&
    typeof candidate.createdAt === "string"
  );
}

export function parseReservationSnapshot(
  snapshot: string,
): ReservationReadResult {
  try {
    const parsed = JSON.parse(snapshot);

    if (!Array.isArray(parsed)) {
      return invalidReservationData();
    }

    if (!parsed.every(isReservation)) {
      return invalidReservationData();
    }

    return {
      ok: true,
      reservations: parsed,
    };
  } catch {
    return invalidReservationData();
  }
}
