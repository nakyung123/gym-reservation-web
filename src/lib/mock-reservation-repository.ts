import {
  EMPTY_RESERVATION_SNAPSHOT,
  createReservationsReadySnapshot,
  findActiveReservationDuplicate,
  RESERVATION_PAGE_SIZE,
  type ReservationCancelResult,
  type ReservationCreateResult,
  type ReservationPageResult,
  type ReservationReadResult,
  type ReservationRepository,
} from "@/lib/reservation-repository";
import type { Reservation, ReservationDraft } from "@/types/domain";

// dev / 시연용 in-memory reservation repository.
// - 페이지 새로고침 시 상태가 초기화된다 (의도).
// - 백엔드 의존 없이 UI 흐름을 빠르게 만질 때 사용.
// - 운영 분기는 db만 허용한다. 이 mock이 운영에서 선택되면 데이터가 휘발되므로 위험.

let reservations: Reservation[] = [];
let snapshot = EMPTY_RESERVATION_SNAPSHOT;
const listeners = new Set<() => void>();

function publish() {
  snapshot = createReservationsReadySnapshot(reservations);
  listeners.forEach((listener) => listener());
}

function buildReservation(draft: ReservationDraft): Reservation {
  const now = new Date().toISOString();
  return {
    id: `mock-reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: draft.userId,
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
    time: draft.time,
    price: draft.price,
    status: "reserved",
    paymentMethod: draft.paymentMethod ?? null,
    phone: draft.phone ?? null,
    createdAt: now,
  };
}

async function createReservation(
  reservation: Reservation,
): Promise<ReservationCreateResult> {
  const duplicate = findActiveReservationDuplicate(reservations, reservation);
  if (duplicate) {
    return {
      ok: false,
      status: "duplicate",
      message: "이미 같은 조건의 예약이 있습니다.",
      reservation: duplicate,
      reservations,
    };
  }

  reservations = [...reservations, reservation];
  publish();

  return {
    ok: true,
    status: "created",
    reservation,
    reservations,
  };
}

async function cancelReservation(
  reservationId: string,
): Promise<ReservationCancelResult> {
  const target = reservations.find(
    (candidate) => candidate.id === reservationId,
  );
  if (!target) {
    return {
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
      reservations,
    };
  }

  if (target.status === "cancelled") {
    return {
      ok: true,
      status: "unchanged",
      message: "이미 취소된 예약입니다.",
      reservation: target,
      reservations,
    };
  }

  if (target.status !== "reserved") {
    return {
      ok: false,
      status: "not-cancellable",
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
      reservation: target,
      reservations,
    };
  }

  reservations = reservations.map((candidate) =>
    candidate.id === reservationId
      ? { ...candidate, status: "cancelled" as const }
      : candidate,
  );
  publish();

  const updated = reservations.find(
    (candidate) => candidate.id === reservationId,
  );
  if (!updated) {
    return {
      ok: false,
      status: "not-found",
      message: "예약 상태를 갱신한 뒤 다시 찾지 못했습니다.",
      reservations,
    };
  }

  return {
    ok: true,
    status: "cancelled",
    message: "예약이 취소되었습니다.",
    reservation: updated,
    reservations,
  };
}

export const mockReservationRepository: ReservationRepository = {
  read(): ReservationReadResult {
    return { ok: true, reservations };
  },
  // 실제 구현(api)은 서버에서 페이지를 잘라 받는다. 결과 형태는 같아야 한다.
  async fetchPage(page): Promise<ReservationPageResult> {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const sorted = [...reservations].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    const start = (safePage - 1) * RESERVATION_PAGE_SIZE;
    return {
      ok: true,
      reservations: sorted.slice(start, start + RESERVATION_PAGE_SIZE),
      total: sorted.length,
    };
  },
  // mock은 메모리에 전부 들고 있으므로 같은 조건으로 걸러 주기만 하면 된다.
  // 실제 구현(api)은 서버에서 좁혀 받는다 — 결과는 동일해야 한다.
  async fetchActiveInScope(scope): Promise<ReservationReadResult> {
    return {
      ok: true,
      reservations: reservations.filter(
        (reservation) =>
          reservation.status === "reserved" &&
          reservation.gymId === scope.gymId &&
          reservation.sport === scope.sport &&
          reservation.date === scope.date,
      ),
    };
  },
  create: createReservation,
  build: buildReservation,
  cancel: cancelReservation,
  getSnapshot() {
    return snapshot;
  },
  getServerSnapshot() {
    return EMPTY_RESERVATION_SNAPSHOT;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
