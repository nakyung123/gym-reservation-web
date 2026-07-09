import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import {
  DEMO_RESERVATION_ID_PREFIX,
  isPaymentMethod,
  isReservationStatus,
  isSport,
} from "@/lib/domain-constants";
import { getReservationActiveKey } from "@/lib/reservation-repository";
import {
  isValidReservationDateValue,
  validateReservationDraft,
  validateUserReservationCancellation,
} from "@/lib/reservation-rules";
import {
  computeReservationPrice,
  isValidPeople,
} from "@/lib/sport-capacity";
import { ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT } from "@/lib/admin/admin-reservation-slot-policy";
import type { AdminReservationTrendPoint } from "@/lib/admin/admin-overview-client";
import { toDomainGym } from "@/lib/server/db-gym-mapper";
import type {
  Gym,
  PaymentMethod,
  Reservation,
  ReservationDraft,
  ReservationSlotAvailability,
  ReservationStatus,
  Sport,
} from "@/types/domain";

const DEFAULT_SLOT_CAPACITY = 4;
const MAX_SLOT_CAPACITY = 999;

type ReservationRow = Prisma.ReservationGetPayload<Prisma.ReservationDefaultArgs>;
type ReservationSlotRow = Prisma.ReservationSlotGetPayload<
  Prisma.ReservationSlotDefaultArgs
>;
type ReservationRowWithGym = Prisma.ReservationGetPayload<{
  include: { gym: { include: { sports: true } } };
}>;
type ReservationSlotKey = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
};

export const RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT =
  ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT;

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
    // 알 수 없는 값은 null로 정규화(결제수단 도입 이전/손상 데이터 방어).
    paymentMethod: isPaymentMethod(row.paymentMethod) ? row.paymentMethod : null,
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

function slotKeyId(key: ReservationSlotKey): string {
  return `${key.gymId}\u0000${key.sport}\u0000${key.date}\u0000${key.time}`;
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

  // Postgres에서는 reserved word date/time을 따옴표("...")로 escape한다.
  // Prisma updateMany는 컬럼 vs 컬럼 비교(reserved_count < capacity)를 지원하지 않아
  // raw SQL이 필요.
  const updatedCount = await tx.$executeRaw(
    Prisma.sql`
      UPDATE reservation_slots
      SET reserved_count = reserved_count + 1
      WHERE gym_id = ${key.gymId}
        AND sport = ${key.sport}
        AND "date" = ${key.date}
        AND "time" = ${key.time}
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

type SlotPolicyValidationError = {
  ok: false;
  status: "rejected";
  message: string;
};

type SlotPolicyValidationInput = {
  gym: Gym;
  gymId: string;
  sport: Sport;
  capacity?: number;
  isClosed?: boolean;
};

function validateSlotPolicyChange({
  gym,
  gymId,
  sport,
  capacity,
  isClosed,
}: SlotPolicyValidationInput): SlotPolicyValidationError | null {
  if (gym.id !== gymId) {
    return {
      ok: false,
      status: "rejected",
      message: "체육관 정보와 슬롯 변경 대상이 일치하지 않습니다.",
    };
  }

  if (!gym.sports.includes(sport)) {
    return {
      ok: false,
      status: "rejected",
      message: "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
    };
  }

  if (capacity === undefined && isClosed === undefined) {
    return {
      ok: false,
      status: "rejected",
      message: "변경할 정원 또는 마감 상태가 필요합니다.",
    };
  }

  if (
    capacity !== undefined &&
    (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SLOT_CAPACITY)
  ) {
    return {
      ok: false,
      status: "rejected",
      message: `정원은 1명 이상 ${MAX_SLOT_CAPACITY}명 이하의 정수여야 합니다.`,
    };
  }

  return null;
}

export async function updateReservationSlotPolicy({
  gym,
  capacity,
  isClosed,
  ...key
}: UpdateReservationSlotPolicyInput): Promise<UpdateReservationSlotPolicyOutput> {
  const validationError = validateSlotPolicyChange({
    gym,
    gymId: key.gymId,
    sport: key.sport,
    capacity,
    isClosed,
  });
  if (validationError) return validationError;

  if (!isValidReservationDateValue(key.date)) {
    return {
      ok: false,
      status: "rejected",
      message: "날짜는 YYYY-MM-DD 형식이어야 합니다.",
    };
  }

  if (!gym.availableTimes.includes(key.time)) {
    return {
      ok: false,
      status: "rejected",
      message: "선택한 시간은 이 체육관의 예약 가능 시간이 아닙니다.",
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

export type UpdateReservationSlotPoliciesInput = {
  gym: Gym;
  gymId: string;
  sport: Sport;
  dates: string[];
  times: string[];
  capacity?: number;
  isClosed?: boolean;
};

export type UpdateReservationSlotPoliciesOutput =
  | {
      ok: true;
      slots: ReservationSlotAvailability[];
      updatedCount: number;
    }
  | {
      ok: false;
      status: "rejected" | "conflict";
      message: string;
      conflicts?: ReservationSlotAvailability[];
    };

export async function updateReservationSlotPolicies({
  gym,
  gymId,
  sport,
  dates,
  times,
  capacity,
  isClosed,
}: UpdateReservationSlotPoliciesInput): Promise<UpdateReservationSlotPoliciesOutput> {
  const validationError = validateSlotPolicyChange({
    gym,
    gymId,
    sport,
    capacity,
    isClosed,
  });
  if (validationError) return validationError;

  const uniqueDates = Array.from(new Set(dates));
  const uniqueTimes = Array.from(new Set(times));
  const targetCount = uniqueDates.length * uniqueTimes.length;

  if (uniqueDates.length === 0 || uniqueTimes.length === 0) {
    return {
      ok: false,
      status: "rejected",
      message: "변경할 날짜와 시간대를 1개 이상 선택해야 합니다.",
    };
  }

  if (uniqueDates.some((date) => !isValidReservationDateValue(date))) {
    return {
      ok: false,
      status: "rejected",
      message: "날짜는 YYYY-MM-DD 형식이어야 합니다.",
    };
  }

  const invalidTime = uniqueTimes.find((time) => !gym.availableTimes.includes(time));
  if (invalidTime) {
    return {
      ok: false,
      status: "rejected",
      message: `${invalidTime}은 이 체육관의 예약 가능 시간이 아닙니다.`,
    };
  }

  if (targetCount > RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT) {
    return {
      ok: false,
      status: "rejected",
      message: `한 번에 변경할 수 있는 슬롯은 최대 ${RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT}개입니다.`,
    };
  }

  const keys = uniqueDates.flatMap((date) =>
    uniqueTimes.map((time) => ({
      gymId,
      sport,
      date,
      time,
    })),
  );

  return prisma.$transaction(async (tx) => {
    const currentRows = await tx.reservationSlot.findMany({
      where: {
        gymId,
        sport,
        date: { in: uniqueDates },
        time: { in: uniqueTimes },
      },
    });
    const currentByKey = new Map(
      currentRows.map((row) => [
        slotKeyId({
          gymId: row.gymId,
          sport,
          date: row.date,
          time: row.time,
        }),
        row,
      ]),
    );

    const conflicts = keys.flatMap((key) => {
      const current = currentByKey.get(slotKeyId(key));
      const reservedCount = current?.reservedCount ?? 0;
      const nextCapacity =
        capacity ?? current?.capacity ?? DEFAULT_SLOT_CAPACITY;

      if (nextCapacity >= reservedCount) return [];
      return [toSlotAvailability(key, current)];
    });

    if (conflicts.length > 0) {
      return {
        ok: false,
        status: "conflict",
        message: `이미 예약된 인원보다 낮은 정원으로 줄일 수 없는 슬롯이 ${conflicts.length}개 있습니다.`,
        conflicts,
      };
    }

    const slots: ReservationSlotAvailability[] = [];
    for (const key of keys) {
      const current = currentByKey.get(slotKeyId(key));
      const nextCapacity =
        capacity ?? current?.capacity ?? DEFAULT_SLOT_CAPACITY;
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

      slots.push(toSlotAvailability(key, slot));
    }

    return {
      ok: true,
      slots,
      updatedCount: slots.length,
    };
  });
}

export async function listUserReservations(
  userId: string,
  input: { status?: ReservationStatus } = {},
): Promise<Reservation[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      userId,
      ...(input.status === undefined ? {} : { status: input.status }),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainReservation);
}

export async function getUserReservationById(
  userId: string,
  reservationId: string,
): Promise<Reservation | null> {
  const row = await prisma.reservation.findFirst({
    where: { id: reservationId, userId },
  });

  return row ? toDomainReservation(row) : null;
}

export type UserReservationDetailRecord = {
  reservation: Reservation;
  gym: Gym;
};

function toUserReservationDetailRecord(
  row: ReservationRowWithGym,
): UserReservationDetailRecord {
  return {
    reservation: toDomainReservation(row),
    gym: toDomainGym(row.gym),
  };
}

export async function getUserReservationDetailById(
  userId: string,
  reservationId: string,
): Promise<UserReservationDetailRecord | null> {
  const row = await prisma.reservation.findFirst({
    where: { id: reservationId, userId },
    include: { gym: { include: { sports: true } } },
  });

  return row ? toUserReservationDetailRecord(row) : null;
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

export async function getAdminReservationById(
  reservationId: string,
): Promise<Reservation | null> {
  const row = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });

  return row ? toDomainReservation(row) : null;
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
  { excludeDemo = false }: { excludeDemo?: boolean } = {},
): Promise<AdminReservationOverview> {
  // excludeDemo는 "reservation 3쿼리"에만 건다(데모 예약 id prefix 제외). 운영 일일 리포트가
  // 데모 시드로 부풀지 않도록 daily-report.ts에서 true로 호출한다. admin 매출/정산 화면은 기본
  // false라 데모를 그대로 보여준다(데모 시드의 본래 목적). reservationSlot는 시드가 슬롯·락을
  // 우회해 demo 개념이 없으므로 필터를 걸지 않는다(이미 demo-free).
  const demoFilter = excludeDemo
    ? { id: { not: { startsWith: DEMO_RESERVATION_ID_PREFIX } } }
    : {};

  const [reservationRows, expectedRevenue, usedRevenue, slotRows] =
    await Promise.all([
      prisma.reservation.groupBy({
        by: ["status"],
        where: { date, ...demoFilter },
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: {
          date,
          status: { in: ["reserved", "used"] },
          ...demoFilter,
        },
        _sum: { price: true },
      }),
      prisma.reservation.aggregate({
        where: {
          date,
          status: "used",
          ...demoFilter,
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

// from~to(둘 다 포함)의 날짜 문자열 목록. date 컬럼이 YYYY-MM-DD 문자열이므로 UTC 기준으로 돈다.
function enumerateDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// 일별 예약 상태 추이(대시보드 차트용). 예약이 없는 날짜도 0으로 채워 반환한다.
// 범위 길이 제한은 route에서 검증한다.
export async function getAdminReservationDailyTrend(
  from: string,
  to: string,
): Promise<AdminReservationTrendPoint[]> {
  const rows = await prisma.reservation.groupBy({
    by: ["date", "status"],
    where: { date: { gte: from, lte: to } },
    _count: { _all: true },
  });

  const byDate = new Map<string, AdminReservationTrendPoint>(
    enumerateDateRange(from, to).map((date) => [
      date,
      { date, reserved: 0, cancelled: 0, used: 0 },
    ]),
  );

  rows.forEach((row) => {
    if (!isReservationStatus(row.status)) {
      throw new Error(`알 수 없는 예약 상태입니다: ${row.status}`);
    }
    const point = byDate.get(row.date);
    if (!point) {
      throw new Error(`조회 범위를 벗어난 날짜입니다: ${row.date}`);
    }
    point[row.status] = row._count._all;
  });

  return [...byDate.values()];
}

export type CreateReservationInput = {
  userId: string;
  // people은 전송용 transient. 서버가 단가 × clamp(people)로 합산가를 재계산해 저장한다.
  draft: {
    gymId: string;
    sport: Sport;
    date: string;
    time: string;
    people?: number;
    paymentMethod?: PaymentMethod | null;
  };
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

export async function createReservationInDb(
  input: CreateReservationInput,
): Promise<CreateReservationOutput> {
  const { userId, draft, gym } = input;

  // 인원 범위 검증은 트랜잭션 진입 전 early reject (새 중간 상태 없음).
  if (!isValidPeople(draft.sport, draft.people)) {
    return {
      ok: false,
      status: "rejected",
      message: "이용 인원이 올바르지 않습니다.",
    };
  }

  const reservationsForUser = await listUserReservations(userId);
  const fullDraft: ReservationDraft = {
    userId,
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
    time: draft.time,
    // 저장가 = 단가 × clamp(people). people 미전송 시 ×1 → 기존 동작 유지.
    price: computeReservationPrice(gym, draft.sport, draft.people),
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
          paymentMethod: draft.paymentMethod ?? null,
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
      status: "not-found" | "not-cancellable";
      reservation?: Reservation;
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
      if (!latest) {
        return {
          status: "not-found",
          reservation: null,
        } as const;
      }
      return {
        status: latest.status === "cancelled" ? "unchanged" : "not-cancellable",
        reservation: latest,
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

  if (result.status === "not-found") {
    return {
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
    };
  }

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

export async function cancelReservationInDb(
  userId: string,
  reservationId: string,
  { now = new Date() }: { now?: Date } = {},
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

  if (target.status === "reserved") {
    const cancellationRule = validateUserReservationCancellation({
      reservation: target,
      now,
    });

    if (!cancellationRule.ok) {
      return {
        ok: false,
        status: "not-cancellable",
        reservation: toDomainReservation(target),
        message: cancellationRule.message,
      };
    }
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

export async function cancelReservationAsAdminInDb(
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

export async function markReservationUsedInDb(
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
        status:
          latest?.status === "used"
            ? ("unchanged" as const)
            : latest
              ? ("not-usable" as const)
              : ("not-found" as const),
        reservation: latest,
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

  if (result.status === "not-found") {
    return {
      ok: false,
      status: "not-found",
      message: "이용 완료 처리할 예약을 찾을 수 없습니다.",
    };
  }

  if (!result.reservation) {
    return {
      ok: false,
      status: "not-found",
      message: "이용 완료 처리할 예약을 찾을 수 없습니다.",
    };
  }

  const reservation = toDomainReservation(result.reservation);
  if (result.status === "not-usable") {
    return {
      ok: false,
      status: "not-usable",
      reservation,
      message: "예약 완료 상태의 예약만 이용 완료 처리할 수 있습니다.",
    };
  }

  return {
    ok: true,
    status: result.status,
    reservation,
    message:
      result.status === "used"
        ? "예약을 이용 완료 처리했습니다."
        : "이미 이용 완료 처리된 예약입니다.",
  };
}
