import "server-only";
import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import {
  DEMO_RESERVATION_ID_PREFIX,
  isPaymentMethod,
  isReservationStatus,
  isSport,
} from "@/lib/domain-constants";
import {
  getReservationActiveKey,
  RESERVATION_PAGE_SIZE,
} from "@/lib/reservation-repository";
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
import { getPaymentProviderByName } from "@/lib/server/payment/payment-config";
import {
  refundPaymentBeforeCancel,
  type ResolvePaymentProvider,
} from "@/lib/server/payment/payment-refund";
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
export type ReservationSlotKey = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
};

export const RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT =
  ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT;

export class ReservationSlotFullError extends Error {
  constructor(readonly key: ReservationSlotKey) {
    super("reservation-slot-full");
  }
}

// 벌크 슬롯 정책 변경 중 조건부 UPDATE가 거부된 경우(동시 예약 유입으로 정원 축소 불가).
// 트랜잭션 전체를 롤백하기 위해 throw로 전파하고, 호출부가 conflict 응답으로 변환한다.
class ReservationSlotPolicyConflictError extends Error {
  constructor(readonly conflicts: ReservationSlotAvailability[]) {
    super("reservation-slot-policy-conflict");
  }
}

export function toDomainReservation(row: ReservationRow): Reservation {
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
    phone: row.phone ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function newReservationId(): string {
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

export async function reserveSlot(
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

export async function releaseSlot(
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

function paymentSlotKey(payment: Payment): ReservationSlotKey {
  if (!isSport(payment.sport)) {
    throw new Error(`결제 ${payment.id}의 sport가 알 수 없는 값입니다: ${payment.sport}`);
  }
  return {
    gymId: payment.gymId,
    sport: payment.sport,
    date: payment.date,
    time: payment.time,
  };
}

// 결제를 끝 상태로 닫고 선점한 정원을 돌려준다. from 상태일 때만 바뀐다(중복 반환 방지).
export async function closePaymentAndReleaseSlot(
  paymentId: string,
  from: "pending" | "confirming",
  to: "failed" | "expired" | "refunded",
  reason: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!current) return false;
    const changed = await tx.payment.updateMany({
      where: { id: paymentId, status: from },
      data: {
        status: to,
        holdKey: null,
        failureReason: reason.slice(0, 200),
        ...(to === "refunded" ? { refundedAt: new Date() } : {}),
      },
    });
    if (changed.count === 1) {
      await releaseSlot(tx, paymentSlotKey(current));
      return true;
    }
    return false;
  });
}

// 만료 정리 범위. 정원을 읽는 쪽이 자기가 볼 슬롯(또는 사용자)의 만료 선점만 먼저 푼다.
// 범위가 없으면 전체에서 오래된 순으로 limit건을 푼다(prepare·정리 cron).
export type StalePaymentScope =
  | { gymId: string; sport: string; dates: readonly string[] }
  | { userId: string };

// 결제창을 닫고 떠난 선점(pending, 만료 시각 지남)을 expired로 닫고 정원을 돌려준다.
// 슬롯 정원(reservedCount)에 선점이 포함되므로, 정원을 읽거나 검사하기 전에 부른다.
export async function expireStalePayments({
  now,
  limit,
  scope,
}: {
  now: Date;
  limit: number;
  scope?: StalePaymentScope;
}): Promise<number> {
  const scopeWhere: Prisma.PaymentWhereInput = !scope
    ? {}
    : "userId" in scope
      ? { userId: scope.userId }
      : { gymId: scope.gymId, sport: scope.sport, date: { in: [...scope.dates] } };
  const stale = await prisma.payment.findMany({
    where: { status: "pending", expiresAt: { lte: now }, ...scopeWhere },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of stale) {
    if (await closePaymentAndReleaseSlot(id, "pending", "expired", "hold-expired")) {
      expired += 1;
    }
  }
  return expired;
}

// 정원을 읽기 전에 그 범위의 만료 선점을 푼다. 정리가 실패해도 본 요청은 진행한다
// (정리 대상은 다음 요청이나 정리 cron이 다시 처리한다). 실패는 로그로 남긴다.
export async function expireStalePaymentsBeforeRead(
  scope: StalePaymentScope,
  now: Date,
  label: string,
): Promise<void> {
  try {
    await expireStalePayments({ now, limit: 50, scope });
  } catch (error) {
    console.error(`[${label}] 만료 선점 정리 실패`, {
      name: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function listReservationSlotAvailabilities({
  gym,
  sport,
  date,
  now = new Date(),
}: {
  gym: Gym;
  sport: Sport;
  date: string;
  now?: Date;
}): Promise<ReservationSlotAvailability[]> {
  // 결제창을 닫고 떠난 선점이 정원을 계속 잡고 있지 않게, 보여 줄 슬롯의 만료 선점을 먼저 푼다.
  await expireStalePaymentsBeforeRead(
    { gymId: gym.id, sport, dates: [date] },
    now,
    "reservation slots",
  );
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
  now?: Date;
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
      message: `정원은 1팀 이상 ${MAX_SLOT_CAPACITY}팀 이하의 정수여야 합니다.`,
    };
  }

  return null;
}

export async function updateReservationSlotPolicy({
  gym,
  capacity,
  isClosed,
  now = new Date(),
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

  // 만료 선점이 정원 축소를 막지 않게 먼저 푼다.
  await expireStalePaymentsBeforeRead(
    { gymId: key.gymId, sport: key.sport, dates: [key.date] },
    now,
    "admin slot policy",
  );

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
        message: `이미 ${reservedCount}팀이 예약한 시간대라 정원을 ${nextCapacity}팀으로 줄일 수 없습니다.`,
      };
    }

    // 행이 없으면 먼저 생성해 둔다(신규 행은 reservedCount=0이라 아래 조건을 항상 통과).
    await tx.reservationSlot.upsert({
      where: { gymId_sport_date_time: key },
      create: {
        ...key,
        capacity: nextCapacity,
        isClosed: isClosed ?? false,
      },
      update: {},
    });

    // 경합 방어: 위의 read-check 이후 동시 예약이 reservedCount를 올렸을 수 있으므로
    // reservedCount <= nextCapacity 조건을 UPDATE 자체에 포함한다. 행 잠금 후 조건이
    // 재평가되어, 검사~쓰기 사이에 끼어든 예약이 있으면 저장이 거부된다(초과예약 방지).
    const changed = await tx.reservationSlot.updateMany({
      where: { ...key, reservedCount: { lte: nextCapacity } },
      data: {
        capacity: nextCapacity,
        ...(isClosed === undefined ? {} : { isClosed }),
      },
    });

    if (changed.count === 0) {
      const latest = await tx.reservationSlot.findUnique({
        where: { gymId_sport_date_time: key },
      });
      return {
        ok: false,
        status: "conflict",
        message: `이미 ${latest?.reservedCount ?? reservedCount}팀이 예약한 시간대라 정원을 ${nextCapacity}팀으로 줄일 수 없습니다.`,
      };
    }

    const slot = await tx.reservationSlot.findUniqueOrThrow({
      where: { gymId_sport_date_time: key },
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
  now?: Date;
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
  now = new Date(),
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

  // 만료 선점이 정원 축소를 막지 않게 먼저 푼다.
  await expireStalePaymentsBeforeRead(
    { gymId, sport, dates: uniqueDates },
    now,
    "admin slot policies",
  );

  const keys = uniqueDates.flatMap((date) =>
    uniqueTimes.map((time) => ({
      gymId,
      sport,
      date,
      time,
    })),
  );

  try {
    return await prisma.$transaction(async (tx) => {
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
          message: `이미 예약된 팀 수보다 낮은 정원으로 줄일 수 없는 슬롯이 ${conflicts.length}개 있습니다.`,
          conflicts,
        };
      }

      const slots: ReservationSlotAvailability[] = [];
      for (const key of keys) {
        const current = currentByKey.get(slotKeyId(key));
        const nextCapacity =
          capacity ?? current?.capacity ?? DEFAULT_SLOT_CAPACITY;

        // 행이 없으면 먼저 생성(신규 행은 reservedCount=0이라 아래 조건을 항상 통과).
        await tx.reservationSlot.upsert({
          where: { gymId_sport_date_time: key },
          create: {
            ...key,
            capacity: nextCapacity,
            isClosed: isClosed ?? false,
          },
          update: {},
        });

        // 경합 방어: 위의 conflict 사전 검사 이후 동시 예약이 reservedCount를 올렸을 수
        // 있으므로 reservedCount <= nextCapacity 조건을 UPDATE 자체에 포함한다.
        // 거부되면 throw로 트랜잭션 전체를 롤백해 all-or-nothing을 유지한다.
        const changed = await tx.reservationSlot.updateMany({
          where: { ...key, reservedCount: { lte: nextCapacity } },
          data: {
            capacity: nextCapacity,
            ...(isClosed === undefined ? {} : { isClosed }),
          },
        });

        if (changed.count === 0) {
          const latest = await tx.reservationSlot.findUnique({
            where: { gymId_sport_date_time: key },
          });
          throw new ReservationSlotPolicyConflictError([
            toSlotAvailability(key, latest),
          ]);
        }

        const slot = await tx.reservationSlot.findUniqueOrThrow({
          where: { gymId_sport_date_time: key },
        });

        slots.push(toSlotAvailability(key, slot));
      }

      return {
        ok: true,
        slots,
        updatedCount: slots.length,
      };
    });
  } catch (error) {
    if (error instanceof ReservationSlotPolicyConflictError) {
      return {
        ok: false,
        status: "conflict",
        message: `이미 예약된 팀 수보다 낮은 정원으로 줄일 수 없는 슬롯이 ${error.conflicts.length}개 있습니다.`,
        conflicts: error.conflicts,
      };
    }
    throw error;
  }
}

export type ListUserReservationsInput = {
  status?: ReservationStatus;
  // 슬롯 단위 조회용 선택 필터. 예약 폼이 (체육관·종목·날짜) 범위의 활성 예약만
  // 받아 중복 판정에 쓴다. 미지정이면 기존처럼 전체를 반환한다.
  gymId?: string;
  sport?: Sport;
  date?: string;
};

export async function listUserReservations(
  userId: string,
  input: ListUserReservationsInput = {},
): Promise<Reservation[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      userId,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.gymId === undefined ? {} : { gymId: input.gymId }),
      ...(input.sport === undefined ? {} : { sport: input.sport }),
      ...(input.date === undefined ? {} : { date: input.date }),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainReservation);
}

/**
 * 예약 목록을 페이지 단위로 조회한다(최신순 + 전체 건수).
 *
 * listUserReservations가 전 기간 예약을 모두 반환하는 것과 달리, 응답 크기가
 * RESERVATION_PAGE_SIZE로 고정된다. 누적 예약이 많은 사용자의 마이페이지가
 * 수백 KB를 받던 문제를 이 경로로 해결한다.
 */
export async function listUserReservationsPage(
  userId: string,
  { page = 1 }: { page?: number } = {},
): Promise<{ reservations: Reservation[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const selectPage = (target: number) =>
    prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (target - 1) * RESERVATION_PAGE_SIZE,
      take: RESERVATION_PAGE_SIZE,
    });

  const [rows, total] = await Promise.all([
    selectPage(safePage),
    prisma.reservation.count({ where: { userId } }),
  ]);

  // 범위를 넘는 page(주소창 직접 수정 등)는 마지막 페이지로 클램프한다.
  // 빈 표를 돌려주면 페이지네이션 위젯은 마지막 페이지를 가리키는데 표만 비어
  // 서로 어긋나 보인다. 흔한 경로가 아니므로 이때만 한 번 더 조회한다.
  const lastPage = Math.max(1, Math.ceil(total / RESERVATION_PAGE_SIZE));
  if (rows.length === 0 && total > 0 && safePage > lastPage) {
    const clamped = await selectPage(lastPage);
    return { reservations: clamped.map(toDomainReservation), total };
  }

  return { reservations: rows.map(toDomainReservation), total };
}

// 예약 생성 시 룰 재검증에 넘길 "중복 후보"만 조회한다.
//
// validateReservationDraft가 reservations 배열을 쓰는 곳은 findActiveDuplicate 하나뿐이고,
// 그 조건은 (userId, gymId, sport, date, time) 완전 일치 + status="reserved"다.
// 따라서 같은 조건으로 DB에서 먼저 걸러 넘겨도 검증 결과가 동일하다
// (제외되는 행은 원래도 find 조건에 걸릴 수 없던 행이다).
//
// 전 기간 예약을 로드하던 기존 방식과 달리 사용자의 누적 예약 수와 무관하게 비용이 일정하다.
// 정합성 자체는 ReservationLock의 activeKey UNIQUE가 DB에서 보장하며, 이 조회는
// 사용자에게 보여줄 기존 예약을 찾기 위한 것이다.
export async function listActiveDuplicateCandidates(
  userId: string,
  draft: CreateReservationInput["draft"],
): Promise<Reservation[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      userId,
      gymId: draft.gymId,
      sport: draft.sport,
      date: draft.date,
      time: draft.time,
      status: "reserved",
    },
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

// 예약에 연결된 결제가 환불 대기인지. 예약 상세가 마감 뒤 재취소 버튼을 보일지 정할 때 쓴다.
export async function hasPendingRefund(reservationId: string): Promise<boolean> {
  return (
    (await prisma.payment.count({
      where: { reservationId, status: "refund_pending" },
    })) > 0
  );
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
    // 이 예약 건의 연락처. 형식 검증은 route(parsePhoneValue)가 담당한다.
    phone?: string | null;
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

export type ValidatedReservationCreation = {
  fullDraft: ReservationDraft;
  activeKey: string;
  slotKey: ReservationSlotKey;
};

// 예약 생성 전 서버 검증(인원·규칙·중복). 결제 없는 즉시 예약과 결제 준비(prepare)가 함께 쓴다.
// DB를 바꾸지 않는다.
export async function validateReservationCreation(
  input: CreateReservationInput,
): Promise<
  | { ok: true; value: ValidatedReservationCreation }
  | { ok: false; output: Exclude<CreateReservationOutput, { ok: true }> }
> {
  const { userId, draft, gym } = input;

  // 인원 범위 검증은 트랜잭션 진입 전 early reject (새 중간 상태 없음).
  if (!isValidPeople(draft.sport, draft.people)) {
    return {
      ok: false,
      output: {
        ok: false,
        status: "rejected",
        message: "이용 인원이 올바르지 않습니다.",
      },
    };
  }

  const duplicateCandidates = await listActiveDuplicateCandidates(userId, draft);
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
    reservations: duplicateCandidates,
    draft: fullDraft,
  });

  if (!validation.ok) {
    if (
      validation.reason === "duplicate-active-reservation" &&
      validation.reservation
    ) {
      return {
        ok: false,
        output: {
          ok: false,
          status: "duplicate",
          reservation: validation.reservation,
          message: validation.message,
        },
      };
    }
    return {
      ok: false,
      output: { ok: false, status: "rejected", message: validation.message },
    };
  }

  return {
    ok: true,
    value: {
      fullDraft,
      activeKey: getReservationActiveKey(fullDraft),
      slotKey: {
        gymId: draft.gymId,
        sport: draft.sport,
        date: draft.date,
        time: draft.time,
      },
    },
  };
}

// 정원 초과·마감으로 슬롯 선점이 거부됐을 때의 응답. 즉시 예약과 결제 준비가 같은 문구를 쓴다.
export async function buildSlotFullOutput(
  key: ReservationSlotKey,
): Promise<Extract<CreateReservationOutput, { status: "full" }>> {
  const slot = await prisma.reservationSlot.findUnique({
    where: { gymId_sport_date_time: key },
  });
  return {
    ok: false,
    status: "full",
    slot: toSlotAvailability(key, slot),
    message:
      slot?.isClosed === true
        ? "선택한 시간대는 운영자에 의해 마감되었습니다."
        : "선택한 시간대의 예약 정원이 마감되었습니다.",
  };
}

export async function createReservationInDb(
  input: CreateReservationInput,
): Promise<CreateReservationOutput> {
  const { userId, draft } = input;

  const validated = await validateReservationCreation(input);
  if (!validated.ok) {
    return validated.output;
  }
  const { fullDraft, activeKey, slotKey } = validated.value;
  const reservationId = newReservationId();

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
          phone: draft.phone ?? null,
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
      return buildSlotFullOutput(error.key);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // activeKey는 (userId, gymId, sport, date, time)의 결합이라 같은 조건으로 조회해도
      // 결과가 같다. activeKey 컬럼에는 인덱스가 없어 풀스캔이 되므로 위와 같은 조회를 쓴다.
      const [existing] = await listActiveDuplicateCandidates(userId, draft);
      if (existing) {
        return {
          ok: false,
          status: "duplicate",
          reservation: existing,
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
      // refund-failed: 결제된 예약인데 PG 환불이 실패했다. 예약은 그대로 남아 있다.
      status: "not-found" | "not-cancellable" | "auth-required" | "refund-failed";
      reservation?: Reservation;
      message: string;
      refunded?: true;
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
      status: "not-found" | "not-cancellable" | "refund-failed";
      reservation?: Reservation;
      message: string;
      // 예약은 이용 완료라 취소하지 않았지만 결제 환불은 끝냈다(돈이 움직였다). 관리자 감사 기록에 쓴다.
      refunded?: true;
    };

export type CancelReservationOptions = {
  // 테스트가 가짜 PG를 넣을 때 쓴다. 기본은 결제 기록의 provider 이름으로 고른다.
  resolvePaymentProvider?: ResolvePaymentProvider;
};

const REFUNDED_BUT_NOT_CANCELLED_MESSAGE =
  "이미 이용 완료된 예약이라 취소하지 않았습니다. 결제는 환불되었습니다.";

// PG 환불이 끝난 결제(refund_pending)를 refunded로 닫는다. 결제가 없거나 이미 닫혔으면 아무것도 바꾸지 않는다.
async function markRefundPendingPaymentRefunded(
  client: Prisma.TransactionClient,
  reservationId: string,
) {
  await client.payment.updateMany({
    where: { reservationId, status: "refund_pending" },
    data: { status: "refunded", refundedAt: new Date() },
  });
}

async function cancelAuthorizedReservation(
  target: ReservationRow,
  {
    resolvePaymentProvider = getPaymentProviderByName,
  }: CancelReservationOptions = {},
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
    // 취소 요청과 이용 완료 처리가 겹치면 예약은 이용 완료인데 결제가 환불 대기로 남을 수 있다.
    // 같은 멱등키로 환불을 끝내고 결제를 닫는다(돈이 돌아간 상태에 기록을 맞춘다). 예약은 그대로 둔다.
    const pendingRefund = await prisma.payment.findUnique({
      where: { reservationId: target.id },
    });
    if (pendingRefund?.status === "refund_pending") {
      const refund = await refundPaymentBeforeCancel(
        pendingRefund,
        resolvePaymentProvider,
      );
      if (!refund.ok) {
        return {
          ok: false,
          status: "refund-failed",
          reservation: domainTarget,
          message: refund.message,
        };
      }
      await markRefundPendingPaymentRefunded(prisma, target.id);
      return {
        ok: false,
        status: "not-cancellable",
        reservation: domainTarget,
        message: REFUNDED_BUT_NOT_CANCELLED_MESSAGE,
        refunded: true,
      };
    }
    return {
      ok: false,
      status: "not-cancellable",
      reservation: domainTarget,
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
    };
  }

  // 결제된 예약이면 환불을 먼저 끝낸다. 환불이 실패하면 예약을 취소하지 않는다.
  const payment = await prisma.payment.findUnique({
    where: { reservationId: target.id },
  });
  let refundedAtProvider = false;
  if (
    payment &&
    (payment.status === "paid" || payment.status === "refund_pending")
  ) {
    const refund = await refundPaymentBeforeCancel(
      payment,
      resolvePaymentProvider,
    );
    if (!refund.ok) {
      return {
        ok: false,
        status: "refund-failed",
        reservation: domainTarget,
        message: refund.message,
      };
    }
    refundedAtProvider = true;
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
      if (latest.status === "cancelled") {
        return { status: "unchanged", reservation: latest } as const;
      }
      if (refundedAtProvider) {
        // PG 환불 뒤 예약 취소 전에 예약이 이용 완료로 바뀌었다. 돈은 이미 돌아갔으므로 결제를 닫는다.
        await markRefundPendingPaymentRefunded(tx, target.id);
        return { status: "refunded-not-cancellable", reservation: latest } as const;
      }
      return { status: "not-cancellable", reservation: latest } as const;
    }

    // 환불이 끝난 결제를 예약 취소와 같은 트랜잭션에서 refunded로 닫는다.
    // 결제 없는 예약이면 대상 행이 없어 아무것도 바뀌지 않는다.
    await markRefundPendingPaymentRefunded(tx, target.id);

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
  if (result.status === "refunded-not-cancellable") {
    return {
      ok: false,
      status: "not-cancellable",
      reservation,
      message: REFUNDED_BUT_NOT_CANCELLED_MESSAGE,
      refunded: true,
    };
  }
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
  { now = new Date(), ...options }: { now?: Date } & CancelReservationOptions = {},
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

    // 결제가 환불 대기면 마감 전에 시작한 취소의 환불이 실패해 남은 것이다. 새 취소가 아니라
    // 같은 멱등키로 그 취소를 끝내는 것이므로, 취소 마감이 지났어도 막지 않는다.
    const refundInProgress = !cancellationRule.ok && (await hasPendingRefund(target.id));

    if (!cancellationRule.ok && !refundInProgress) {
      return {
        ok: false,
        status: "not-cancellable",
        reservation: toDomainReservation(target),
        message: cancellationRule.message,
      };
    }
  }

  return cancelAuthorizedReservation(target, options);
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
      status: "not-found" | "not-cancellable" | "refund-failed";
      reservation?: Reservation;
      message: string;
      // 예약은 이용 완료라 취소하지 않았지만 결제 환불은 끝냈다(돈이 움직였다). 관리자 감사 기록에 쓴다.
      refunded?: true;
    };

export async function cancelReservationAsAdminInDb(
  reservationId: string,
  options: CancelReservationOptions = {},
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

  return cancelAuthorizedReservation(target, options);
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

  // 환불 중인 예약을 이용 완료로 바꾸면 취소가 끝나지 못해 결제가 환불 대기로 남는다.
  // 이 확인과 이용 완료 처리 사이에 환불이 시작되는 경합은 취소 쪽(cancelAuthorizedReservation)이
  // 환불을 끝내고 결제를 닫아 처리한다.
  const refunding = await prisma.payment.findFirst({
    where: { reservationId, status: "refund_pending" },
    select: { id: true },
  });
  if (refunding) {
    return {
      ok: false,
      status: "not-usable",
      reservation: domainTarget,
      message: "환불 처리 중인 예약이라 이용 완료로 바꿀 수 없습니다. 환불이 끝나면 예약이 취소됩니다.",
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
