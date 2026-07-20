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
  invalidReservationData,
  isReservation,
  LOADING_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
  remoteReservationUnavailable,
  reservationAuthRequired,
  reservationsNotReady,
  type ActiveReservationScope,
  type ReservationCancelResult,
  type ReservationCreateResult,
  type ReservationPageResult,
  type ReservationReadResult,
  type ReservationRepository,
  type ReservationRepositoryFailure,
} from "@/lib/reservation-repository";
import { isAbortError } from "@/lib/async-error";
import { isReservationSlotAvailability } from "@/lib/reservation-slot-availability";
import type { Reservation, ReservationDraft } from "@/types/domain";

type IdTokenResult =
  | { ok: true; idToken: string }
  | {
      ok: false;
      reason: "auth-required" | "remote-unavailable";
      message: string;
    };

let currentSnapshot = LOADING_RESERVATION_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;
let lastFetchedUserId: string | null = null;
const pendingReservationsById = new Map<string, Reservation>();

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

async function readResponseMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function isSameReservation(left: Reservation, right: Reservation): boolean {
  return (
    left.id === right.id &&
    left.userId === right.userId &&
    left.gymId === right.gymId &&
    left.sport === right.sport &&
    left.date === right.date &&
    left.time === right.time &&
    left.price === right.price &&
    left.status === right.status &&
    left.createdAt === right.createdAt
  );
}

function mergePendingReservations(reservations: Reservation[]): Reservation[] {
  const byId = new Map(
    reservations.map((reservation) => [reservation.id, reservation]),
  );

  for (const [reservationId, pendingReservation] of pendingReservationsById) {
    if (pendingReservation.userId !== lastFetchedUserId) {
      continue;
    }

    const serverReservation = byId.get(reservationId);
    if (
      serverReservation &&
      isSameReservation(serverReservation, pendingReservation)
    ) {
      pendingReservationsById.delete(reservationId);
      continue;
    }

    byId.set(reservationId, pendingReservation);
  }

  return sortReservations([...byId.values()]);
}

function upsertCurrentReservation(reservation: Reservation) {
  if (lastFetchedUserId !== null && reservation.userId !== lastFetchedUserId) {
    return;
  }

  pendingReservationsById.set(reservation.id, reservation);

  const current = parseReservationSnapshot(currentSnapshot);
  const currentReservations = current.ok ? current.reservations : [];
  const exists = currentReservations.some((item) => item.id === reservation.id);
  const next = exists
    ? currentReservations.map((item) =>
        item.id === reservation.id ? reservation : item,
      )
    : [reservation, ...currentReservations];

  setCurrentSnapshot(createReservationsReadySnapshot(sortReservations(next)));
}

async function getIdToken(authRequiredMessage: string): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        reason: "auth-required",
        message: authRequiredMessage,
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      reason: "remote-unavailable",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

async function fetchReservations(userId: string): Promise<void> {
  const token = await getIdToken(
    "로그인 정보가 없어 예약 목록을 불러올 수 없습니다.",
  );
  if (!token.ok) {
    if (lastFetchedUserId === userId) {
      setCurrentSnapshot(
        createReservationsFailedSnapshot(
          token.reason === "auth-required"
            ? reservationAuthRequired(token.message)
            : remoteReservationUnavailable(token.message),
        ),
      );
    }
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/reservations", {
      headers: { Authorization: `Bearer ${token.idToken}` },
    });
  } catch {
    if (lastFetchedUserId !== userId) {
      return;
    }
    setCurrentSnapshot(
      createReservationsFailedSnapshot(
        remoteReservationUnavailable(
          "예약 목록 요청에 실패했습니다. 다시 시도해 주세요.",
        ),
      ),
    );
    return;
  }

  if (!response.ok) {
    if (lastFetchedUserId !== userId) {
      return;
    }
    const fallbackMessage = `예약 목록을 불러오지 못했습니다. status=${response.status}`;
    const message = await readResponseMessage(response, fallbackMessage);
    const failure =
      response.status === 401 || response.status === 403
        ? reservationAuthRequired(message)
        : remoteReservationUnavailable(message);

    setCurrentSnapshot(
      createReservationsFailedSnapshot(failure),
    );
    return;
  }

  let data: { reservations?: unknown };
  try {
    data = (await response.json()) as { reservations?: unknown };
  } catch {
    if (lastFetchedUserId !== userId) {
      return;
    }
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
    if (lastFetchedUserId !== userId) {
      return;
    }
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
    createReservationsReadySnapshot(mergePendingReservations(data.reservations)),
  );
}

function syncWithAuth() {
  const session = getCurrentFirebaseAuthSession();

  if (!session.ok) {
    if (lastFetchedUserId !== null) {
      lastFetchedUserId = null;
      pendingReservationsById.clear();
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

  pendingReservationsById.clear();
  lastFetchedUserId = session.userId;
  setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);

  void fetchReservations(session.userId);
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
    // draft.paymentMethod/phone은 선택적이므로 미전송 시 null로 정규화한다.
    paymentMethod: draft.paymentMethod ?? null,
    phone: draft.phone ?? null,
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
  const token = await getIdToken("로그인 정보가 없어 예약을 처리할 수 없습니다.");
  if (!token.ok) {
    return {
      ok: false,
      status: "failed",
      message: token.message,
      reason: token.reason,
    };
  }

  // people은 Reservation 도메인 타입엔 없는 전송용 transient다. build()가 draft에서
  // spread로 실어 보내므로 여기서만 로컬 캐스트로 읽어 POST 본문에 포함한다.
  // 서버는 이 값으로 합산가(단가 × 인원)를 재계산해 저장한다.
  const people = (reservation as Reservation & { people?: number }).people;

  let response: Response;
  try {
    response = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gymId: reservation.gymId,
        sport: reservation.sport,
        date: reservation.date,
        time: reservation.time,
        people,
        paymentMethod: reservation.paymentMethod,
        phone: reservation.phone,
      }),
    });
  } catch {
    return {
      ok: false,
      status: "failed",
      message: "예약 요청에 실패했습니다. 다시 시도해 주세요.",
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
  const token = await getIdToken("로그인 정보가 없어 예약을 취소할 수 없습니다.");
  if (!token.ok) {
    return {
      ok: false,
      status: "failed",
      message: token.message,
      reason: token.reason,
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/reservations/${encodeURIComponent(reservationId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.idToken}` },
      },
    );
  } catch {
    return {
      ok: false,
      status: "failed",
      message: "예약 취소 요청에 실패했습니다. 다시 시도해 주세요.",
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
    upsertCurrentReservation(data.reservation);

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

/**
 * (체육관·종목·날짜) 범위의 활성 예약만 서버에서 조회한다.
 *
 * 전체 목록 스냅샷과 별개 경로다. 스냅샷은 사용자의 누적 예약에 비례해 커지지만
 * 이 조회는 해당 슬롯 묶음(시간대 수)으로 결과가 제한된다.
 * 스냅샷을 갱신하지 않으므로 목록 화면 상태에 영향을 주지 않는다.
 */
async function fetchActiveInScope(
  scope: ActiveReservationScope,
  signal?: AbortSignal,
): Promise<ReservationReadResult> {
  const token = await getIdToken(
    "로그인 정보가 없어 예약 정보를 확인할 수 없습니다.",
  );
  if (!token.ok) {
    return token.reason === "auth-required"
      ? reservationAuthRequired(token.message)
      : remoteReservationUnavailable(token.message);
  }

  const query = new URLSearchParams({
    status: "reserved",
    gymId: scope.gymId,
    sport: scope.sport,
    date: scope.date,
  });

  let response: Response;
  try {
    response = await fetch(`/api/reservations?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token.idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      // 다른 날짜/종목으로 이동해 취소된 요청. 실패로 보고하지 않는다.
      return { ok: true, reservations: [] };
    }
    return remoteReservationUnavailable(
      "예약 정보를 불러오지 못했습니다. 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    const message = await readResponseMessage(
      response,
      "예약 정보를 불러오지 못했습니다.",
    );
    return response.status === 401 || response.status === 403
      ? reservationAuthRequired(message)
      : remoteReservationUnavailable(message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return remoteReservationUnavailable(
      "예약 정보 응답 형식이 올바르지 않습니다.",
    );
  }

  const reservations = (payload as { reservations?: unknown })?.reservations;
  if (!Array.isArray(reservations) || !reservations.every(isReservation)) {
    return invalidReservationData();
  }

  return { ok: true, reservations };
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
      pendingReservationsById.clear();
      setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);
    }
  };
}

/**
 * 목록 화면용 페이지 조회. 스냅샷과 별개 경로이며 스냅샷을 갱신하지 않는다.
 * 응답 크기가 RESERVATION_PAGE_SIZE로 고정된다.
 */
async function fetchPage(
  page: number,
  signal?: AbortSignal,
): Promise<ReservationPageResult> {
  const token = await getIdToken(
    "로그인 정보가 없어 예약 목록을 불러올 수 없습니다.",
  );
  if (!token.ok) {
    return token.reason === "auth-required"
      ? reservationAuthRequired(token.message)
      : remoteReservationUnavailable(token.message);
  }

  let response: Response;
  try {
    response = await fetch(`/api/reservations?page=${page}`, {
      headers: { Authorization: `Bearer ${token.idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      // 다른 페이지로 이동해 취소된 요청. 실패로 보고하지 않는다.
      return { ok: true, reservations: [], total: 0 };
    }
    return remoteReservationUnavailable(
      "예약 목록을 불러오지 못했습니다. 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    const message = await readResponseMessage(
      response,
      "예약 목록을 불러오지 못했습니다.",
    );
    return response.status === 401 || response.status === 403
      ? reservationAuthRequired(message)
      : remoteReservationUnavailable(message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return remoteReservationUnavailable(
      "예약 목록 응답 형식이 올바르지 않습니다.",
    );
  }

  const body = payload as { reservations?: unknown; total?: unknown };
  if (
    !Array.isArray(body.reservations) ||
    !body.reservations.every(isReservation) ||
    typeof body.total !== "number" ||
    !Number.isInteger(body.total) ||
    body.total < 0
  ) {
    return invalidReservationData();
  }

  return { ok: true, reservations: body.reservations, total: body.total };
}

export const apiReservationRepository: ReservationRepository = {
  read,
  fetchActiveInScope,
  fetchPage,
  create: createReservation,
  build: buildReservation,
  cancel: cancelReservation,
  getSnapshot: () => currentSnapshot,
  getServerSnapshot: () => LOADING_RESERVATION_SNAPSHOT,
  subscribe: subscribeReservations,
};
