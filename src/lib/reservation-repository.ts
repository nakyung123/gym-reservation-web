import type {
  Reservation,
  ReservationDraft,
  ReservationSlotAvailability,
  Sport,
} from "@/types/domain";

export const EMPTY_RESERVATION_SNAPSHOT = "[]";

export function createReservationsLoadingSnapshot(
  message = "예약 정보를 불러오고 있습니다.",
): string {
  return JSON.stringify({
    status: "loading",
    message,
  });
}

export const LOADING_RESERVATION_SNAPSHOT =
  createReservationsLoadingSnapshot();

export type ReservationRepositoryFailureReason =
  | "storage-unavailable"
  | "invalid-storage-data"
  | "not-ready"
  | "auth-required"
  | "remote-unavailable";

export type ReservationRepositoryFailure = {
  ok: false;
  reason: ReservationRepositoryFailureReason;
  message: string;
};

export type ReservationReadResult =
  | {
      ok: true;
      reservations: Reservation[];
    }
  | ReservationRepositoryFailure;

export type ReservationCreateResult =
  | {
      ok: true;
      status: "created";
      reservation: Reservation;
      reservations?: Reservation[];
    }
  | {
      ok: false;
      status: "duplicate";
      message: string;
      reservation: Reservation;
      reservations: Reservation[];
    }
  | {
      ok: false;
      status: "full";
      message: string;
      slot: ReservationSlotAvailability;
    }
  | {
      ok: false;
      status: "failed";
      message: string;
      reason: ReservationRepositoryFailureReason;
    };

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
      reason: ReservationRepositoryFailureReason;
    };

/** 활성 예약 조회 범위. 예약 폼의 중복 판정이 보는 단위와 같다. */
export type ActiveReservationScope = {
  gymId: string;
  sport: Sport;
  date: string;
};

/**
 * 예약 목록 페이지당 항목 수. 서버(skip/take)와 클라이언트(총 페이지 수 계산)가
 * 같은 값을 봐야 하므로 여기에 둔다.
 */
export const RESERVATION_PAGE_SIZE = 10;

export type ReservationPageResult =
  | {
      ok: true;
      reservations: Reservation[];
      /** 필터 없이 센 사용자의 전체 예약 수. 총 페이지 계산용. */
      total: number;
    }
  | ReservationRepositoryFailure;

export type ReservationRepository = {
  read(): ReservationReadResult;
  /**
   * 특정 (체육관·종목·날짜)의 활성 예약만 조회한다.
   *
   * read()가 사용자의 전 기간 예약을 반환하는 것과 달리, 이건 결과 크기가
   * 그 슬롯 묶음(시간대 수)으로 제한된다. 예약 폼은 중복 판정에만 예약 목록이
   * 필요하므로 전체 목록을 구독하지 않고 이 경로를 쓴다.
   */
  fetchActiveInScope(
    scope: ActiveReservationScope,
    signal?: AbortSignal,
  ): Promise<ReservationReadResult>;
  /**
   * 예약 목록을 페이지 단위로 조회한다(최신순).
   *
   * read()가 전 기간 예약을 한 번에 반환하는 것과 달리, 응답 크기가
   * RESERVATION_PAGE_SIZE로 고정된다. 목록 화면은 이 경로를 쓴다.
   */
  fetchPage(
    page: number,
    signal?: AbortSignal,
  ): Promise<ReservationPageResult>;
  create(reservation: Reservation): Promise<ReservationCreateResult>;
  build(draft: ReservationDraft): Reservation;
  cancel(reservationId: string): Promise<ReservationCancelResult>;
  getSnapshot(): string;
  getServerSnapshot(): string;
  subscribe(listener: () => void): () => void;
};

type ReservationSnapshot =
  | {
      status: "ready";
      reservations: unknown;
    }
  | {
      status: "loading";
      message: unknown;
    }
  | {
      status: "failed";
      reason: unknown;
      message: unknown;
    };

export function invalidReservationData(): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "invalid-storage-data",
    message:
      "저장된 예약 데이터 형식이 올바르지 않습니다. 예약 목록을 확인할 수 없습니다.",
  };
}

export function reservationsNotReady(
  message = "예약 정보를 불러오고 있습니다.",
): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "not-ready",
    message,
  };
}

export function reservationAuthRequired(
  message = "로그인 정보를 확인할 수 없어 예약을 처리할 수 없습니다.",
): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "auth-required",
    message,
  };
}

export function remoteReservationUnavailable(
  message = "Firebase 예약 저장소에 연결할 수 없습니다.",
): ReservationRepositoryFailure {
  return {
    ok: false,
    reason: "remote-unavailable",
    message,
  };
}

export function createReservationsReadySnapshot(
  reservations: Reservation[],
): string {
  return JSON.stringify({
    status: "ready",
    reservations,
  });
}

export function createReservationsFailedSnapshot(
  failure: ReservationRepositoryFailure,
): string {
  return JSON.stringify({
    status: "failed",
    reason: failure.reason,
    message: failure.message,
  });
}

// activeKey 인코딩에 필요한 5개 필드만 받도록 시그니처를 좁힌다.
// Reservation/ReservationDraft 도메인 타입은 sport가 Sport literal union이지만,
// Prisma row의 sport는 string이므로 둘 다 받을 수 있도록 string으로 정의한다.
export function getReservationActiveKey(reservation: {
  userId: string;
  gymId: string;
  sport: string;
  date: string;
  time: string;
}): string {
  return [
    reservation.userId,
    reservation.gymId,
    reservation.sport,
    reservation.date,
    reservation.time,
  ]
    .map(encodeURIComponent)
    .join("__");
}

export function findActiveReservationDuplicate(
  reservations: Reservation[],
  target: Reservation | ReservationDraft,
): Reservation | undefined {
  return reservations.find(
    (reservation) =>
      reservation.status === "reserved" &&
      getReservationActiveKey(reservation) === getReservationActiveKey(target),
  );
}

export function isReservation(value: unknown): value is Reservation {
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
    // paymentMethod는 결제수단 도입 이전 데이터를 위해 미전송(undefined)/null도 허용한다.
    (candidate.paymentMethod === undefined ||
      candidate.paymentMethod === null ||
      typeof candidate.paymentMethod === "string") &&
    // phone도 연락처 도입 이전 데이터를 위해 미전송(undefined)/null을 허용한다.
    (candidate.phone === undefined ||
      candidate.phone === null ||
      typeof candidate.phone === "string") &&
    typeof candidate.createdAt === "string"
  );
}

function isSnapshotObject(value: unknown): value is ReservationSnapshot {
  return value !== null && typeof value === "object" && "status" in value;
}

function isFailureReason(
  value: unknown,
): value is ReservationRepositoryFailureReason {
  return (
    value === "storage-unavailable" ||
    value === "invalid-storage-data" ||
    value === "not-ready" ||
    value === "auth-required" ||
    value === "remote-unavailable"
  );
}

function parseReservations(value: unknown): ReservationReadResult {
  if (!Array.isArray(value)) {
    return invalidReservationData();
  }

  if (!value.every(isReservation)) {
    return invalidReservationData();
  }

  return {
    ok: true,
    reservations: value,
  };
}

export function parseReservationSnapshot(
  snapshot: string,
): ReservationReadResult {
  try {
    const parsed = JSON.parse(snapshot);

    if (Array.isArray(parsed)) {
      return parseReservations(parsed);
    }

    if (!isSnapshotObject(parsed)) {
      return invalidReservationData();
    }

    if (parsed.status === "ready") {
      return parseReservations(parsed.reservations);
    }

    if (parsed.status === "loading" && typeof parsed.message === "string") {
      return reservationsNotReady(parsed.message);
    }

    if (
      parsed.status === "failed" &&
      isFailureReason(parsed.reason) &&
      typeof parsed.message === "string"
    ) {
      return {
        ok: false,
        reason: parsed.reason,
        message: parsed.message,
      };
    }

    return invalidReservationData();
  } catch {
    return invalidReservationData();
  }
}
