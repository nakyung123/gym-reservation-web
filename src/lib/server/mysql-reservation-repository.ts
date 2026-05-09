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
  const remaining = Math.max(0, capacity - reservedCount);

  return {
    ...key,
    capacity,
    reservedCount,
    remaining,
    status: remaining > 0 ? "available" : "full",
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

export async function listUserReservations(
  userId: string,
): Promise<Reservation[]> {
  const rows = await prisma.reservation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainReservation);
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
        message: "선택한 시간대의 예약 정원이 마감되었습니다.",
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
      where: { id: reservationId, userId, status: "reserved" },
      data: { status: "cancelled" },
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

    await releaseSlot(tx, {
      gymId: target.gymId,
      sport: target.sport as Sport,
      date: target.date,
      time: target.time,
    });

    const latest = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });

    return {
      status: "cancelled" as const,
      reservation: latest,
    };
  });

  return {
    ok: true,
    status: result.status,
    reservation: toDomainReservation(result.reservation),
    message:
      result.status === "cancelled"
        ? "예약이 취소되었습니다."
        : "이미 취소된 예약입니다.",
  };
}
