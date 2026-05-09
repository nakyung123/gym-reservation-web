"use client";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
  type FirebaseAuthSessionResult,
} from "@/lib/firebase-auth-session";
import {
  createReservationsFailedSnapshot,
  createReservationsLoadingSnapshot,
  createReservationsReadySnapshot,
  isReservation,
  LOADING_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
  remoteReservationUnavailable,
  reservationAuthRequired,
  reservationsNotReady,
  type ReservationCancelResult,
  type ReservationCreateResult,
  type ReservationRepository,
  type ReservationRepositoryFailure,
} from "@/lib/reservation-repository";
import { isReservationSlotAvailability } from "@/lib/reservation-slot-availability";
import type { Reservation, ReservationDraft } from "@/types/domain";

let currentSnapshot = LOADING_RESERVATION_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;
let lastFetchedUserId: string | null = null;
let inflightFetch: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSnapshot(next: string) {
  if (currentSnapshot === next) {
    return;
  }
  currentSnapshot = next;
  notifyListeners();
}

function getAuthFailure(
  authSession: Exclude<FirebaseAuthSessionResult, { ok: true }>,
): ReservationRepositoryFailure {
  if (authSession.reason === "not-ready") {
    return reservationsNotReady(authSession.message);
  }
  return reservationAuthRequired(authSession.message);
}

function getCurrentReservations(): Reservation[] {
  const current = parseReservationSnapshot(currentSnapshot);
  return current.ok ? current.reservations : [];
}

function sortReservations(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function upsertCurrentReservation(reservation: Reservation) {
  const current = parseReservationSnapshot(currentSnapshot);
  if (!current.ok) {
    return;
  }
  const exists = current.reservations.some((item) => item.id === reservation.id);
  const next = exists
    ? current.reservations.map((item) =>
        item.id === reservation.id ? reservation : item,
      )
    : [reservation, ...current.reservations];

  setCurrentSnapshot(createReservationsReadySnapshot(sortReservations(next)));
}

async function getIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return null;
    }
    return await auth.currentUser.getIdToken();
  } catch (error) {
    console.error("ID 토큰을 가져오지 못했습니다.", error);
    return null;
  }
}

async function fetchReservations(userId: string): Promise<void> {
  const idToken = await getIdToken();
  if (!idToken) {
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/reservations", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (error) {
    setCurrentSnapshot(
      createReservationsFailedSnapshot(
        remoteReservationUnavailable(
          `예약 목록 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`,
        ),
      ),
    );
    return;
  }

  if (!response.ok) {
    setCurrentSnapshot(
      createReservationsFailedSnapshot(
        remoteReservationUnavailable(
          `예약 목록을 불러오지 못했습니다. status=${response.status}`,
        ),
      ),
    );
    return;
  }

  let data: { reservations?: unknown };
  try {
    data = (await response.json()) as { reservations?: unknown };
  } catch {
    setCurrentSnapshot(
      createReservationsFailedSnapshot(
        remoteReservationUnavailable("예약 응답 형식이 올바르지 않습니다."),
      ),
    );
    return;
  }

  if (
    !Array.isArray(data.reservations) ||
    !data.reservations.every(isReservation)
  ) {
    setCurrentSnapshot(
      createReservationsFailedSnapshot(
        remoteReservationUnavailable("예약 응답 형식이 올바르지 않습니다."),
      ),
    );
    return;
  }

  if (lastFetchedUserId !== userId) {
    return;
  }

  setCurrentSnapshot(
    createReservationsReadySnapshot(sortReservations(data.reservations)),
  );
}

function syncWithAuth() {
  const session = getCurrentFirebaseAuthSession();

  if (!session.ok) {
    if (lastFetchedUserId !== null) {
      lastFetchedUserId = null;
    }
    if (session.reason === "not-ready") {
      setCurrentSnapshot(createReservationsLoadingSnapshot(session.message));
      return;
    }
    setCurrentSnapshot(createReservationsFailedSnapshot(getAuthFailure(session)));
    return;
  }

  if (session.userId === lastFetchedUserId) {
    return;
  }

  lastFetchedUserId = session.userId;
  setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);

  if (!inflightFetch) {
    inflightFetch = fetchReservations(session.userId).finally(() => {
      inflightFetch = null;
    });
  }
}

function ensureAuthSubscription() {
  if (authUnsubscribe) {
    return;
  }
  authUnsubscribe = subscribeFirebaseAuthSession(syncWithAuth);
  syncWithAuth();
}

function buildReservation(draft: ReservationDraft): Reservation {
  // 클라이언트가 만든 placeholder. 실제 id/createdAt은 서버가 부여하며,
  // service.ts는 서버 응답의 reservation을 사용한다.
  return {
    ...draft,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pending-${Date.now()}`,
    status: "reserved",
    createdAt: new Date().toISOString(),
  };
}

type ApiCreateResponse = {
  status?: unknown;
  reservation?: unknown;
  slot?: unknown;
  message?: unknown;
};

async function createReservation(
  reservation: Reservation,
): Promise<ReservationCreateResult> {
  const idToken = await getIdToken();
  if (!idToken) {
    return {
      ok: false,
      status: "failed",
      message: "로그인 정보가 없어 예약을 처리할 수 없습니다.",
      reason: "auth-required",
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gymId: reservation.gymId,
        sport: reservation.sport,
        date: reservation.date,
        time: reservation.time,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: `예약 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`,
      reason: "remote-unavailable",
    };
  }

  let data: ApiCreateResponse;
  try {
    data = (await response.json()) as ApiCreateResponse;
  } catch {
    return {
      ok: false,
      status: "failed",
      message: "서버 응답 형식이 올바르지 않습니다.",
      reason: "remote-unavailable",
    };
  }

  if (
    response.status === 201 &&
    data.status === "created" &&
    isReservation(data.reservation)
  ) {
    upsertCurrentReservation(data.reservation);
    return { ok: true, status: "created", reservation: data.reservation };
  }

  if (
    response.status === 409 &&
    data.status === "duplicate" &&
    isReservation(data.reservation)
  ) {
    upsertCurrentReservation(data.reservation);
    return {
      ok: false,
      status: "duplicate",
      message:
        typeof data.message === "string"
          ? data.message
          : "이미 같은 조건의 예약이 있습니다.",
      reservation: data.reservation,
      reservations: getCurrentReservations(),
    };
  }

  if (
    response.status === 409 &&
    data.status === "full" &&
    isReservationSlotAvailability(data.slot)
  ) {
    return {
      ok: false,
      status: "full",
      message:
        typeof data.message === "string"
          ? data.message
          : "선택한 시간이 마감되었습니다.",
      slot: data.slot,
    };
  }

  return {
    ok: false,
    status: "failed",
    message:
      typeof data.message === "string"
        ? data.message
        : `예약 요청 실패: status=${response.status}`,
    reason: response.status === 401 ? "auth-required" : "remote-unavailable",
  };
}

type ApiCancelResponse = {
  status?: unknown;
  reservation?: unknown;
  message?: unknown;
};

async function cancelReservation(
  reservationId: string,
): Promise<ReservationCancelResult> {
  const idToken = await getIdToken();
  if (!idToken) {
    return {
      ok: false,
      status: "failed",
      message: "로그인 정보가 없어 예약을 취소할 수 없습니다.",
      reason: "auth-required",
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/reservations/${encodeURIComponent(reservationId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: `예약 취소 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`,
      reason: "remote-unavailable",
    };
  }

  let data: ApiCancelResponse;
  try {
    data = (await response.json()) as ApiCancelResponse;
  } catch {
    return {
      ok: false,
      status: "failed",
      message: "서버 응답 형식이 올바르지 않습니다.",
      reason: "remote-unavailable",
    };
  }

  if (
    response.ok &&
    (data.status === "cancelled" || data.status === "unchanged") &&
    isReservation(data.reservation)
  ) {
    upsertCurrentReservation(data.reservation);
    return {
      ok: true,
      status: data.status,
      message:
        typeof data.message === "string"
          ? data.message
          : "예약 상태가 변경되었습니다.",
      reservation: data.reservation,
      reservations: getCurrentReservations(),
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: "not-found",
      message:
        typeof data.message === "string"
          ? data.message
          : "취소할 예약을 찾을 수 없습니다.",
      reservations: getCurrentReservations(),
    };
  }

  if (
    response.status === 409 &&
    data.status === "not-cancellable" &&
    isReservation(data.reservation)
  ) {
    return {
      ok: false,
      status: "not-cancellable",
      message:
        typeof data.message === "string"
          ? data.message
          : "예약 완료 상태의 예약만 취소할 수 있습니다.",
      reservation: data.reservation,
      reservations: getCurrentReservations(),
    };
  }

  return {
    ok: false,
    status: "failed",
    message:
      typeof data.message === "string"
        ? data.message
        : `예약 취소 실패: status=${response.status}`,
    reason:
      response.status === 401 || response.status === 403
        ? "auth-required"
        : "remote-unavailable",
  };
}

function read() {
  return parseReservationSnapshot(currentSnapshot);
}

function subscribeReservations(listener: () => void) {
  listeners.add(listener);
  ensureAuthSubscription();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && authUnsubscribe) {
      authUnsubscribe();
      authUnsubscribe = null;
      lastFetchedUserId = null;
      setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);
    }
  };
}

export const apiReservationRepository: ReservationRepository = {
  read,
  create: createReservation,
  build: buildReservation,
  cancel: cancelReservation,
  getSnapshot: () => currentSnapshot,
  getServerSnapshot: () => LOADING_RESERVATION_SNAPSHOT,
  subscribe: subscribeReservations,
};
