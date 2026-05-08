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
  ReservationStatus,
  Sport,
} from "@/types/domain";

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

  try {
    const created = await prisma.$transaction(async (tx) => {
      // reservation을 먼저 INSERT (FK 정합성). UUID라 충돌 없음.
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

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "cancelled" },
    });
    await tx.reservationLock.deleteMany({
      where: { activeKey: target.activeKey },
    });
    return next;
  });

  return {
    ok: true,
    status: "cancelled",
    reservation: toDomainReservation(updated),
    message: "예약이 취소되었습니다.",
  };
}
