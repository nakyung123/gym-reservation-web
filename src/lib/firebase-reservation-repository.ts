import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
  type FirebaseAuthSessionResult,
} from "@/lib/firebase-auth-session";
import { getFirebaseClient } from "@/lib/firebase-client";
import {
  createReservationsFailedSnapshot,
  createReservationsLoadingSnapshot,
  createReservationsReadySnapshot,
  getReservationActiveKey,
  invalidReservationData,
  isReservation,
  LOADING_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
  reservationAuthRequired,
  reservationsNotReady,
  remoteReservationUnavailable,
  type ReservationCancelResult,
  type ReservationCreateResult,
  type ReservationRepository,
  type ReservationRepositoryFailure,
} from "@/lib/reservation-repository";
import {
  getReservationRuleMessage,
  validateUserReservationCancellation,
} from "@/lib/reservation-rules";
import type { Reservation, ReservationDraft } from "@/types/domain";

const RESERVATIONS_COLLECTION = "reservations";
const RESERVATION_LOCKS_COLLECTION = "reservationLocks";

type ReservationLock = {
  activeKey: string;
  reservationId: string;
  status: "reserved";
  updatedAt: string;
};

let currentSnapshot = LOADING_RESERVATION_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;
let remoteUnsubscribe: (() => void) | null = null;
let subscribedUserId: string | null = null;

const listeners = new Set<() => void>();

function createReservationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSnapshot(nextSnapshot: string) {
  if (currentSnapshot === nextSnapshot) {
    return;
  }

  currentSnapshot = nextSnapshot;
  notifyListeners();
}

function failedCreateResult(
  failure: ReservationRepositoryFailure,
): ReservationCreateResult {
  return {
    ok: false,
    status: "failed",
    message: failure.message,
    reason: failure.reason,
  };
}

function failedCancelResult(
  failure: ReservationRepositoryFailure,
): ReservationCancelResult {
  return {
    ok: false,
    status: "failed",
    message: failure.message,
    reason: failure.reason,
  };
}

function getFirebaseFailure(error: unknown): ReservationRepositoryFailure {
  const detail =
    error instanceof Error && error.message ? ` ${error.message}` : "";

  return remoteReservationUnavailable(
    `Firebase 예약 저장소 처리 중 오류가 발생했습니다.${detail}`,
  );
}

function getAuthFailure(
  authSession: Exclude<FirebaseAuthSessionResult, { ok: true }>,
): ReservationRepositoryFailure {
  if (authSession.reason === "not-ready") {
    return reservationsNotReady(authSession.message);
  }

  return reservationAuthRequired(authSession.message);
}

function getCurrentUserIdResult():
  | {
      ok: true;
      userId: string;
    }
  | ReservationRepositoryFailure {
  const authSession = getCurrentFirebaseAuthSession();

  if (!authSession.ok) {
    return getAuthFailure(authSession);
  }

  return {
    ok: true,
    userId: authSession.userId,
  };
}

function parseReservationDocument(
  snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>,
): Reservation | null {
  const data = snapshot.data();

  if (!data || !isReservation(data)) {
    return null;
  }

  if (data.id !== snapshot.id) {
    return null;
  }

  return data;
}

function parseReservationLock(data: DocumentData | undefined): ReservationLock | null {
  if (!data) {
    return null;
  }

  if (
    typeof data.activeKey === "string" &&
    typeof data.reservationId === "string" &&
    data.status === "reserved" &&
    typeof data.updatedAt === "string"
  ) {
    return {
      activeKey: data.activeKey,
      reservationId: data.reservationId,
      status: data.status,
      updatedAt: data.updatedAt,
    };
  }

  return null;
}

function getCurrentReservations() {
  const current = parseReservationSnapshot(currentSnapshot);

  return current.ok ? current.reservations : [];
}

function sortReservations(reservations: Reservation[]) {
  return [...reservations].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function upsertCurrentReservation(reservation: Reservation) {
  const current = parseReservationSnapshot(currentSnapshot);

  if (!current.ok) {
    return;
  }

  const nextReservations = current.reservations.some(
    (item) => item.id === reservation.id,
  )
    ? current.reservations.map((item) =>
        item.id === reservation.id ? reservation : item,
      )
    : [reservation, ...current.reservations];

  setCurrentSnapshot(
    createReservationsReadySnapshot(sortReservations(nextReservations)),
  );
}

function stopRemoteSubscription() {
  if (remoteUnsubscribe) {
    remoteUnsubscribe();
    remoteUnsubscribe = null;
  }

  subscribedUserId = null;
}

function syncRemoteSubscriptionWithAuth() {
  const authSession = getCurrentFirebaseAuthSession();

  if (!authSession.ok) {
    stopRemoteSubscription();

    if (authSession.reason === "not-ready") {
      setCurrentSnapshot(createReservationsLoadingSnapshot(authSession.message));
      return;
    }

    setCurrentSnapshot(createReservationsFailedSnapshot(getAuthFailure(authSession)));
    return;
  }

  if (remoteUnsubscribe && subscribedUserId === authSession.userId) {
    return;
  }

  stopRemoteSubscription();
  subscribedUserId = authSession.userId;
  setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);

  try {
    const { db } = getFirebaseClient();
    const reservationsQuery = query(
      collection(db, RESERVATIONS_COLLECTION),
      where("userId", "==", authSession.userId),
    );

    remoteUnsubscribe = onSnapshot(
      reservationsQuery,
      (querySnapshot) => {
        const reservations: Reservation[] = [];

        for (const documentSnapshot of querySnapshot.docs) {
          const reservation = parseReservationDocument(documentSnapshot);

          if (!reservation) {
            setCurrentSnapshot(
              createReservationsFailedSnapshot(invalidReservationData()),
            );
            return;
          }

          reservations.push(reservation);
        }

        setCurrentSnapshot(
          createReservationsReadySnapshot(sortReservations(reservations)),
        );
      },
      (error) => {
        setCurrentSnapshot(
          createReservationsFailedSnapshot(getFirebaseFailure(error)),
        );
      },
    );
  } catch (error) {
    setCurrentSnapshot(createReservationsFailedSnapshot(getFirebaseFailure(error)));
  }
}

function startRemoteSubscription() {
  if (authUnsubscribe) {
    return;
  }

  authUnsubscribe = subscribeFirebaseAuthSession(
    syncRemoteSubscriptionWithAuth,
  );
  syncRemoteSubscriptionWithAuth();
}

function subscribeReservations(listener: () => void) {
  listeners.add(listener);
  startRemoteSubscription();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      stopRemoteSubscription();

      if (authUnsubscribe) {
        authUnsubscribe();
        authUnsubscribe = null;
      }

      setCurrentSnapshot(LOADING_RESERVATION_SNAPSHOT);
    }
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

async function createReservation(
  reservation: Reservation,
): Promise<ReservationCreateResult> {
  try {
    const userIdResult = getCurrentUserIdResult();

    if (!userIdResult.ok) {
      return failedCreateResult(userIdResult);
    }

    if (reservation.userId !== userIdResult.userId) {
      return failedCreateResult(
        reservationAuthRequired(
          "로그인 사용자와 예약 사용자 정보가 일치하지 않습니다.",
        ),
      );
    }

    const { db } = getFirebaseClient();
    const activeKey = getReservationActiveKey(reservation);
    const reservationRef = doc(db, RESERVATIONS_COLLECTION, reservation.id);
    const lockRef = doc(db, RESERVATION_LOCKS_COLLECTION, activeKey);

    const result = await runTransaction<ReservationCreateResult>(
      db,
      async (transaction) => {
        const lockSnapshot = await transaction.get(lockRef);

        if (lockSnapshot.exists()) {
          const lock = parseReservationLock(lockSnapshot.data());

          if (!lock || lock.activeKey !== activeKey) {
            return failedCreateResult(invalidReservationData());
          }

          const duplicateReservationRef = doc(
            db,
            RESERVATIONS_COLLECTION,
            lock.reservationId,
          );
          const duplicateSnapshot = await transaction.get(
            duplicateReservationRef,
          );
          const duplicate = duplicateSnapshot.exists()
            ? parseReservationDocument(duplicateSnapshot)
            : null;

          if (!duplicate || duplicate.status !== "reserved") {
            return failedCreateResult(invalidReservationData());
          }

          return {
            ok: false,
            status: "duplicate",
            message: getReservationRuleMessage("duplicate-active-reservation"),
            reservation: duplicate,
            reservations: getCurrentReservations(),
          };
        }

        transaction.set(reservationRef, {
          ...reservation,
          activeKey,
        });
        transaction.set(lockRef, {
          activeKey,
          reservationId: reservation.id,
          status: "reserved",
          updatedAt: new Date().toISOString(),
        });

        return {
          ok: true,
          status: "created",
          reservation,
        };
      },
    );

    if (result.ok) {
      upsertCurrentReservation(result.reservation);
    }

    return result;
  } catch (error) {
    return failedCreateResult(getFirebaseFailure(error));
  }
}

async function cancelReservation(
  reservationId: string,
): Promise<ReservationCancelResult> {
  try {
    const userIdResult = getCurrentUserIdResult();

    if (!userIdResult.ok) {
      return failedCancelResult(userIdResult);
    }

    const { db } = getFirebaseClient();
    const reservationRef = doc(db, RESERVATIONS_COLLECTION, reservationId);

    const result = await runTransaction<ReservationCancelResult>(
      db,
      async (transaction) => {
        const reservationSnapshot = await transaction.get(reservationRef);

        if (!reservationSnapshot.exists()) {
          return {
            ok: false,
            status: "not-found",
            message: "취소할 예약을 찾을 수 없습니다.",
            reservations: getCurrentReservations(),
          };
        }

        const reservation = parseReservationDocument(reservationSnapshot);

        if (!reservation) {
          return failedCancelResult(invalidReservationData());
        }

        if (reservation.userId !== userIdResult.userId) {
          return failedCancelResult(
            reservationAuthRequired(
              "로그인 사용자와 예약 소유자가 일치하지 않습니다.",
            ),
          );
        }

        if (reservation.status === "cancelled") {
          return {
            ok: true,
            status: "unchanged",
            message: "이미 취소된 예약입니다.",
            reservation,
            reservations: getCurrentReservations(),
          };
        }

        if (reservation.status !== "reserved") {
          return {
            ok: false,
            status: "not-cancellable",
            message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
            reservation,
            reservations: getCurrentReservations(),
          };
        }

        const cancellationRule = validateUserReservationCancellation({
          reservation,
        });

        if (!cancellationRule.ok) {
          return {
            ok: false,
            status: "not-cancellable",
            message: cancellationRule.message,
            reservation,
            reservations: getCurrentReservations(),
          };
        }

        const activeKey = getReservationActiveKey(reservation);
        const lockRef = doc(db, RESERVATION_LOCKS_COLLECTION, activeKey);
        const lockSnapshot = await transaction.get(lockRef);
        const lock = lockSnapshot.exists()
          ? parseReservationLock(lockSnapshot.data())
          : null;

        if (!lock || lock.reservationId !== reservation.id) {
          return failedCancelResult(invalidReservationData());
        }

        const nextReservation: Reservation = {
          ...reservation,
          status: "cancelled",
        };

        transaction.update(reservationRef, {
          status: nextReservation.status,
        });
        transaction.delete(lockRef);

        return {
          ok: true,
          status: "cancelled",
          message: "예약이 취소되었습니다.",
          reservation: nextReservation,
          reservations: getCurrentReservations().map((item) =>
            item.id === nextReservation.id ? nextReservation : item,
          ),
        };
      },
    );

    if (result.ok) {
      upsertCurrentReservation(result.reservation);
    }

    return result;
  } catch (error) {
    return failedCancelResult(getFirebaseFailure(error));
  }
}

export const firebaseReservationRepository: ReservationRepository = {
  read: () => parseReservationSnapshot(currentSnapshot),
  create: createReservation,
  build: buildReservation,
  cancel: cancelReservation,
  getSnapshot: () => currentSnapshot,
  getServerSnapshot: () => LOADING_RESERVATION_SNAPSHOT,
  subscribe: subscribeReservations,
};
