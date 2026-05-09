import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import { getReservationActiveKey } from "@/lib/reservation-repository";
import { validateReservationDraft } from "@/lib/reservation-rules";
import { getGymSportPrice } from "@/lib/gym-utils";
import type {
  Gym,
  Reservation,
  ReservationDraft,
  ReservationSlotAvailability,
  ReservationStatus,
  Sport,
} from "@/types/domain";

const DEFAULT_SLOT_CAPACITY = 4;

const reservationStatuses: ReservationStatus[] = [
  "reserved",
  "cancelled",
  "used",
];
const sports: Sport[] = ["배드민턴", "농구", "풋살", "탁구", "배구"];

function isReservationStatus(value: unknown): value is ReservationStatus {
  return (
    typeof value === "string" &&
    reservationStatuses.includes(value as ReservationStatus)
  );
}

function isSport(value: unknown): value is Sport {
  return typeof value === "string" && sports.includes(value as Sport);
}

type ReservationRow = Prisma.ReservationGetPayload<Prisma.ReservationDefaultArgs>;
type ReservationSlotRow = Prisma.ReservationSlotGetPayload<
  Prisma.ReservationSlotDefaultArgs
>;
type ReservationSlotKey = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
};

class ReservationSlotFullError extends Error {
  constructor(readonly key: ReservationSlotKey) {
    super("reservation-slot-full");
  }
}

function toDomainReservation(row: ReservationRow): Reservation {
  if (!isReservationStatus(row.status)) {
    throw new Error(
      `예약 ${row.id}의 status가 알 수 없는 값입니다: ${row.status}`,
    );
  }
  if (!isSport(row.sport)) {
    throw new Error(
      `예약 ${row.id}의 sport가 알 수 없는 값입니다: ${row.sport}`,
    );
  }

  return {
    id: row.id,
    userId: row.userId,
    gymId: row.gymId,
    sport: row.sport,
    date: row.date,
    time: row.time,
    price: row.price,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function newReservationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toSlotAvailability(
  key: ReservationSlotKey,
  slot?: ReservationSlotRow | null,
): ReservationSlotAvailability {
  const capacity = slot?.capacity ?? DEFAULT_SLOT_CAPACITY;
  const reservedCount = slot?.reservedCount ?? 0;
  const isClosed = slot?.isClosed ?? false;
  const remaining = isClosed ? 0 : Math.max(0, capacity - reservedCount);

  return {
    ...key,
    capacity,
    reservedCount,
    remaining,
    isClosed,
    status: isClosed ? "closed" : remaining > 0 ? "available" : "full",
  };
}

async function ensureReservationSlot(
  tx: Prisma.TransactionClient,
  key: ReservationSlotKey,
): Promise<void> {
  await tx.reservationSlot.upsert({
    where: {
      gymId_sport_date_time: key,
    },
    create: {
      ...key,
      capacity: DEFAULT_SLOT_CAPACITY,
    },
    update: {},
  });
}

async function reserveSlot(
  tx: Prisma.TransactionClient,
  key: ReservationSlotKey,
): Promise<void> {
  await ensureReservationSlot(tx, key);

  const updatedCount = await tx.$executeRaw(
    Prisma.sql`
      UPDATE reservation_slots
      SET reserved_count = reserved_count + 1
      WHERE gym_id = ${key.gymId}
        AND sport = ${key.sport}
        AND \`date\` = ${key.date}
        AND \`time\` = ${key.time}
        AND is_closed = false
        AND reserved_count < capacity
    `,
  );

  if (updatedCount !== 1) {
    throw new ReservationSlotFullError(key);
  }
}

async function releaseSlot(
  tx: Prisma.TransactionClient,
  key: ReservationSlotKey,
): Promise<void> {
  await tx.reservationSlot.updateMany({
    where: {
      ...key,
      reservedCount: { gt: 0 },
    },
    data: {
      reservedCount: { decrement: 1 },
    },
  });
}

export async function listReservationSlotAvailabilities({
  gym,
  sport,
  date,
}: {
  gym: Gym;
  sport: Sport;
  date: string;
}): Promise<ReservationSlotAvailability[]> {
  const rows = await prisma.reservationSlot.findMany({
    where: {
      gymId: gym.id,
      sport,
      date,
    },
  });
  const rowByTime = new Map(rows.map((row) => [row.time, row]));

  return gym.availableTimes.map((time) =>
    toSlotAvailability(
      {
        gymId: gym.id,
        sport,
        date,
        time,
      },
      rowByTime.get(time),
    ),
  );
}

export type UpdateReservationSlotPolicyInput = ReservationSlotKey & {
  gym: Gym;
  capacity?: number;
  isClosed?: boolean;
};

export type UpdateReservationSlotPolicyOutput =
  | { ok: true; slot: ReservationSlotAvailability }
  | { ok: false; status: "rejected" | "conflict"; message: string };

export async function updateReservationSlotPolicy({
  gym,
  capacity,
  isClosed,
  ...key
}: UpdateReservationSlotPolicyInput): Promise<UpdateReservationSlotPolicyOutput> {
  if (!gym.sports.includes(key.sport)) {
    return {
      ok: false,
      status: "rejected",
      message: "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
    };
  }

  if (!gym.availableTimes.includes(key.time)) {
    return {
      ok: false,
      status: "rejected",
      message: "선택한 시간은 이 체육관의 예약 가능 시간이 아닙니다.",
    };
  }

  if (capacity === undefined && isClosed === undefined) {
    return {
      ok: false,
      status: "rejected",
      message: "변경할 정원 또는 마감 상태가 필요합니다.",
    };
  }

  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
    return {
      ok: false,
      status: "rejected",
      message: "정원은 1명 이상의 정수여야 합니다.",
    };
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.reservationSlot.findUnique({
      where: { gymId_sport_date_time: key },
    });
    const reservedCount = current?.reservedCount ?? 0;
    const nextCapacity = capacity ?? current?.capacity ?? DEFAULT_SLOT_CAPACITY;

    if (nextCapacity < reservedCount) {
      return {
        ok: false,
        status: "conflict",
        message: `이미 ${reservedCount}명이 예약한 시간대라 정원을 ${nextCapacity}명으로 줄일 수 없습니다.`,
      };
    }

    const slot = await tx.reservationSlot.upsert({
      where: {
        gymId_sport_date_time: key,
      },
      create: {
        ...key,
        capacity: nextCapacity,
        isClosed: isClosed ?? false,
      },
      update: {
        capacity: nextCapacity,
        ...(isClosed === undefined ? {} : { isClosed }),
      },
    });

    return {
      ok: true,
      slot: toSlotAvailability(key, slot),
    };
  });
}

export async function listUserReservations(
  userId: string,
): Promise<Reservation[]> {
  const rows = await prisma.reservation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainReservation);
}

export type ListAdminReservationsInput = {
  status?: ReservationStatus;
  gymId?: string;
  date?: string;
  userId?: string;
  limit?: number;
};

export async function listAdminReservations({
  status,
  gymId,
  date,
  userId,
  limit = 100,
}: ListAdminReservationsInput = {}): Promise<Reservation[]> {
  const where: Prisma.ReservationWhereInput = {};
  if (status) where.status = status;
  if (gymId) where.gymId = gymId;
  if (date) where.date = date;
  if (userId) where.userId = userId;

  const rows = await prisma.reservation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toDomainReservation);
}

export type AdminReservationOverview = {
  date: string;
  reservations: {
    total: number;
    reserved: number;
    cancelled: number;
    used: number;
  };
  revenue: {
    expected: number;
    used: number;
  };
  slots: {
    total: number;
    available: number;
    full: number;
    closed: number;
    reservedCount: number;
    capacity: number;
  };
};

export async function getAdminReservationOverview(
  date: string,
): Promise<AdminReservationOverview> {
  const [reservationRows, expectedRevenue, usedRevenue, slotRows] =
    await Promise.all([
      prisma.reservation.groupBy({
        by: ["status"],
        where: { date },
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: {
          date,
          status: { in: ["reserved", "used"] },
        },
        _sum: { price: true },
      }),
      prisma.reservation.aggregate({
        where: {
          date,
          status: "used",
        },
        _sum: { price: true },
      }),
      prisma.reservationSlot.findMany({
        where: { date },
        select: {
          capacity: true,
          reservedCount: true,
          isClosed: true,
        },
      }),
    ]);

  const reservations = {
    total: 0,
    reserved: 0,
    cancelled: 0,
    used: 0,
  };

  reservationRows.forEach((row) => {
    if (!isReservationStatus(row.status)) {
      throw new Error(`알 수 없는 예약 상태입니다: ${row.status}`);
    }
    reservations[row.status] = row._count._all;
    reservations.total += row._count._all;
  });

  const slots = slotRows.reduce(
    (summary, slot) => {
      const status = slot.isClosed
        ? "closed"
        : slot.reservedCount >= slot.capacity
          ? "full"
          : "available";

      return {
        ...summary,
        total: summary.total + 1,
        [status]: summary[status] + 1,
        reservedCount: summary.reservedCount + slot.reservedCount,
        capacity: summary.capacity + slot.capacity,
      };
    },
    {
      total: 0,
      available: 0,
      full: 0,
      closed: 0,
      reservedCount: 0,
      capacity: 0,
    },
  );

  return {
    date,
    reservations,
    revenue: {
      expected: expectedRevenue._sum.price ?? 0,
      used: usedRevenue._sum.price ?? 0,
    },
    slots,
  };
}

export type CreateReservationInput = {
  userId: string;
  draft: { gymId: string; sport: Sport; date: string; time: string };
  gym: Gym;
};

export type CreateReservationOutput =
  | { ok: true; reservation: Reservation }
  | {
      ok: false;
      status: "duplicate";
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      status: "full";
      slot: ReservationSlotAvailability;
      message: string;
    }
  | { ok: false; status: "rejected"; message: string };

export async function createReservationInMysql(
  input: CreateReservationInput,
): Promise<CreateReservationOutput> {
  const { userId, draft, gym } = input;

  const reservationsForUser = await listUserReservations(userId);
  const fullDraft: ReservationDraft = {
    userId,
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
    time: draft.time,
    price: getGymSportPrice(gym, draft.sport),
  };

  // 서버에서 룰 재검증.
  const validation = validateReservationDraft({
    gym,
    reservations: reservationsForUser,
    draft: fullDraft,
  });

  if (!validation.ok) {
    if (
      validation.reason === "duplicate-active-reservation" &&
      validation.reservation
    ) {
      return {
        ok: false,
        status: "duplicate",
        reservation: validation.reservation,
        message: validation.message,
      };
    }
    return { ok: false, status: "rejected", message: validation.message };
  }

  const reservationId = newReservationId();
  const activeKey = getReservationActiveKey(fullDraft);
  const slotKey: ReservationSlotKey = {
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
    time: draft.time,
  };

  try {
    const created = await prisma.$transaction(async (tx) => {
      await reserveSlot(tx, slotKey);

      const reservation = await tx.reservation.create({
        data: {
          id: reservationId,
          userId,
          gymId: draft.gymId,
          sport: draft.sport,
          date: draft.date,
          time: draft.time,
          price: fullDraft.price,
          status: "reserved",
          activeKey,
        },
      });
      // lock INSERT — activeKey UNIQUE 충돌 시 P2002 → 트랜잭션 전체 rollback.
      await tx.reservationLock.create({
        data: { activeKey, reservationId, status: "reserved" },
      });
      return reservation;
    });

    return { ok: true, reservation: toDomainReservation(created) };
  } catch (error) {
    if (error instanceof ReservationSlotFullError) {
      const slot = await prisma.reservationSlot.findUnique({
        where: { gymId_sport_date_time: error.key },
      });

      return {
        ok: false,
        status: "full",
        slot: toSlotAvailability(error.key, slot),
        message:
          slot?.isClosed === true
            ? "선택한 시간대는 운영자에 의해 마감되었습니다."
            : "선택한 시간대의 예약 정원이 마감되었습니다.",
      };
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.reservation.findFirst({
        where: { activeKey, status: "reserved" },
      });
      if (existing) {
        return {
          ok: false,
          status: "duplicate",
          reservation: toDomainReservation(existing),
          message: "이미 같은 조건의 예약이 있습니다.",
        };
      }
    }
    throw error;
  }
}

export type CancelReservationOutput =
  | {
      ok: true;
      status: "cancelled" | "unchanged";
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      status: "not-found" | "not-cancellable" | "auth-required";
      reservation?: Reservation;
      message: string;
    };

type CancelAuthorizedReservationOutput =
  | {
      ok: true;
      status: "cancelled" | "unchanged";
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      status: "not-cancellable";
      reservation: Reservation;
      message: string;
    };

async function cancelAuthorizedReservation(
  target: ReservationRow,
): Promise<CancelAuthorizedReservationOutput> {
  const domainTarget = toDomainReservation(target);

  if (target.status === "cancelled") {
    return {
      ok: true,
      status: "unchanged",
      reservation: domainTarget,
      message: "이미 취소된 예약입니다.",
    };
  }

  if (target.status !== "reserved") {
    return {
      ok: false,
      status: "not-cancellable",
      reservation: domainTarget,
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.reservation.updateMany({
      where: { id: target.id, status: "reserved" },
      data: { status: "cancelled" },
    });

    if (changed.count === 0) {
      const latest = await tx.reservation.findUnique({
        where: { id: target.id },
      });
      return {
        status: latest?.status === "cancelled" ? "unchanged" : "not-cancellable",
        reservation: latest ?? target,
      } as const;
    }

    await tx.reservationLock.deleteMany({
      where: { activeKey: target.activeKey },
    });

    await releaseSlot(tx, {
      gymId: target.gymId,
      sport: domainTarget.sport,
      date: target.date,
      time: target.time,
    });

    const latest = await tx.reservation.findUniqueOrThrow({
      where: { id: target.id },
    });

    return {
      status: "cancelled" as const,
      reservation: latest,
    };
  });

  const reservation = toDomainReservation(result.reservation);
  if (result.status === "not-cancellable") {
    return {
      ok: false,
      status: "not-cancellable",
      reservation,
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
    };
  }

  return {
    ok: true,
    status: result.status,
    reservation,
    message:
      result.status === "cancelled"
        ? "예약이 취소되었습니다."
        : "이미 취소된 예약입니다.",
  };
}

export async function cancelReservationInMysql(
  userId: string,
  reservationId: string,
): Promise<CancelReservationOutput> {
  const target = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });

  if (!target) {
    return {
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
    };
  }

  if (target.userId !== userId) {
    return {
      ok: false,
      status: "auth-required",
      message: "다른 사용자의 예약은 취소할 수 없습니다.",
    };
  }

  return cancelAuthorizedReservation(target);
}

export type CancelReservationAsAdminOutput =
  | {
      ok: true;
      status: "cancelled" | "unchanged";
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      status: "not-found" | "not-cancellable";
      reservation?: Reservation;
      message: string;
    };

export async function cancelReservationAsAdminInMysql(
  reservationId: string,
): Promise<CancelReservationAsAdminOutput> {
  const target = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });

  if (!target) {
    return {
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
    };
  }

  return cancelAuthorizedReservation(target);
}

export type MarkReservationUsedOutput =
  | {
      ok: true;
      status: "used" | "unchanged";
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      status: "not-found" | "not-usable";
      reservation?: Reservation;
      message: string;
    };

export async function markReservationUsedInMysql(
  reservationId: string,
): Promise<MarkReservationUsedOutput> {
  const target = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });

  if (!target) {
    return {
      ok: false,
      status: "not-found",
      message: "이용 완료 처리할 예약을 찾을 수 없습니다.",
    };
  }

  const domainTarget = toDomainReservation(target);

  if (target.status === "used") {
    return {
      ok: true,
      status: "unchanged",
      reservation: domainTarget,
      message: "이미 이용 완료 처리된 예약입니다.",
    };
  }

  if (target.status !== "reserved") {
    return {
      ok: false,
      status: "not-usable",
      reservation: domainTarget,
      message: "예약 완료 상태의 예약만 이용 완료 처리할 수 있습니다.",
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.reservation.updateMany({
      where: { id: reservationId, status: "reserved" },
      data: { status: "used" },
    });

    if (changed.count === 0) {
      const latest = await tx.reservation.findUnique({
        where: { id: reservationId },
      });
      return {
        status: "unchanged" as const,
        reservation: latest ?? target,
      };
    }

    await tx.reservationLock.deleteMany({
      where: { activeKey: target.activeKey },
    });

    const latest = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    return {
      status: "used" as const,
      reservation: latest,
    };
  });

  return {
    ok: true,
    status: result.status,
    reservation: toDomainReservation(result.reservation),
    message:
      result.status === "used"
        ? "예약을 이용 완료 처리했습니다."
        : "이미 이용 완료 처리된 예약입니다.",
  };
}
