import {
  EMPTY_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
  type ReservationCancelResult,
  type ReservationRepository,
  type ReservationRepositoryFailure,
  type ReservationWriteResult,
} from "@/lib/reservation-repository";
import type { Reservation, ReservationDraft } from "@/types/domain";

const STORAGE_KEY = "gym-reservation-web:reservations";
const STORAGE_EVENT = "gym-reservation-web:reservations-changed";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function createReservationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageUnavailable(): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "storage-unavailable",
    message: "브라우저 저장소를 사용할 수 없어 예약 정보를 처리할 수 없습니다.",
  };
}

function replaceReservations(
  reservations: Reservation[],
): ReservationWriteResult {
  if (!canUseStorage()) {
    return storageUnavailable();
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  window.dispatchEvent(new Event(STORAGE_EVENT));

  return {
    ok: true,
    reservations,
  };
}

function readReservations() {
  if (!canUseStorage()) {
    return storageUnavailable();
  }

  return parseReservationSnapshot(
    window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_RESERVATION_SNAPSHOT,
  );
}

function getReservationSnapshot() {
  if (!canUseStorage()) {
    return EMPTY_RESERVATION_SNAPSHOT;
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_RESERVATION_SNAPSHOT;
}

function subscribeReservations(listener: () => void) {
  if (!canUseStorage()) {
    return () => undefined;
  }

  window.addEventListener(STORAGE_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(STORAGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function buildReservation(draft: ReservationDraft): Reservation {
  return {
    ...draft,
    id: createReservationId(),
    status: "reserved",
    createdAt: new Date().toISOString(),
  };
}

function cancelReservation(reservationId: string): ReservationCancelResult {
  const current = readReservations();

  if (!current.ok) {
    return {
      ok: false,
      status: "failed",
      message: current.message,
      reason: current.reason,
    };
  }

  const target = current.reservations.find(
    (reservation) => reservation.id === reservationId,
  );

  if (!target) {
    return {
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
      reservations: current.reservations,
    };
  }

  if (target.status === "cancelled") {
    return {
      ok: true,
      status: "unchanged",
      message: "이미 취소된 예약입니다.",
      reservation: target,
      reservations: current.reservations,
    };
  }

  if (target.status !== "reserved") {
    return {
      ok: false,
      status: "not-cancellable",
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
      reservation: target,
      reservations: current.reservations,
    };
  }

  const nextReservation = {
    ...target,
    status: "cancelled" as const,
  };
  const nextReservations = current.reservations.map((reservation) =>
    reservation.id === reservationId ? nextReservation : reservation,
  );
  const writeResult = replaceReservations(nextReservations);

  if (!writeResult.ok) {
    return {
      ok: false,
      status: "failed",
      message: writeResult.message,
      reason: writeResult.reason,
    };
  }

  return {
    ok: true,
    status: "cancelled",
    message: "예약이 취소되었습니다.",
    reservation: nextReservation,
    reservations: writeResult.reservations,
  };
}

export const localReservationRepository: ReservationRepository = {
  read: readReservations,
  replace: replaceReservations,
  build: buildReservation,
  cancel: cancelReservation,
  getSnapshot: getReservationSnapshot,
  subscribe: subscribeReservations,
};
