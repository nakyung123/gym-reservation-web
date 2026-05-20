import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import { toAdminGym } from "@/lib/server/db-gym-mapper";
import type { AdminGym } from "@/types/domain";

export type AdminGymMutationResult =
  | { ok: true; gym: AdminGym; message: string }
  | {
      ok: false;
      status: "duplicate" | "not-found" | "conflict" | "rejected";
      message: string;
    };

type AdminGymCreateInput = AdminGym;
type AdminGymUpdateInput = Omit<AdminGym, "id">;

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
}

function toGymData(input: AdminGymUpdateInput) {
  return {
    name: input.name,
    region: input.region,
    address: input.address,
    officialUrl: input.officialUrl,
    openHours: input.openHours,
    basePrice: input.basePrice,
    description: input.description,
    latitude: input.latitude,
    longitude: input.longitude,
    sportPrices: input.sportPrices,
    facilities: uniqueStrings(input.facilities),
    availableTimes: uniqueStrings(input.availableTimes),
    closedDays: uniqueStrings(input.closedDays),
    isActive: input.isActive,
  };
}

function toSportRows(input: AdminGymUpdateInput) {
  return uniqueStrings(input.sports).map((sport) => ({ sport }));
}

function isDuplicateError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function validateActiveReservationsCompatibility(
  tx: Prisma.TransactionClient,
  gymId: string,
  input: AdminGymUpdateInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const activeReservations = await tx.reservation.findMany({
    where: {
      gymId,
      status: "reserved",
    },
    select: {
      sport: true,
      time: true,
    },
  });

  if (activeReservations.length === 0) {
    return { ok: true };
  }

  if (!input.isActive) {
    return {
      ok: false,
      message:
        "예약 완료 상태의 예약이 남아 있어 시설을 비활성화할 수 없습니다.",
    };
  }

  const removedSport = activeReservations.find(
    (reservation) =>
      !(input.sports as readonly string[]).includes(reservation.sport),
  );
  if (removedSport) {
    return {
      ok: false,
      message: `예약 완료 상태의 ${removedSport.sport} 예약이 있어 해당 종목을 제거할 수 없습니다.`,
    };
  }

  const removedTime = activeReservations.find(
    (reservation) => !input.availableTimes.includes(reservation.time),
  );
  if (removedTime) {
    return {
      ok: false,
      message: `예약 완료 상태의 ${removedTime.time} 예약이 있어 해당 시간대를 제거할 수 없습니다.`,
    };
  }

  return { ok: true };
}

export async function listAdminGyms(): Promise<AdminGym[]> {
  const rows = await prisma.gym.findMany({
    include: { sports: true },
    orderBy: [{ isActive: "desc" }, { region: "asc" }, { name: "asc" }],
  });

  return rows.map(toAdminGym);
}

export async function createAdminGym(
  input: AdminGymCreateInput,
): Promise<AdminGymMutationResult> {
  try {
    const row = await prisma.gym.create({
      data: {
        id: input.id,
        ...toGymData(input),
        sports: {
          create: toSportRows(input),
        },
      },
      include: { sports: true },
    });

    return {
      ok: true,
      gym: toAdminGym(row),
      message: "시설이 추가되었습니다.",
    };
  } catch (error) {
    if (isDuplicateError(error)) {
      return {
        ok: false,
        status: "duplicate",
        message: "이미 같은 ID의 시설이 있습니다.",
      };
    }
    throw error;
  }
}

export async function updateAdminGym(
  gymId: string,
  input: AdminGymUpdateInput,
): Promise<AdminGymMutationResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.gym.findUnique({
      where: { id: gymId },
      select: { id: true },
    });

    if (!current) {
      return {
        ok: false,
        status: "not-found",
        message: "수정할 시설을 찾을 수 없습니다.",
      };
    }

    const compatibility = await validateActiveReservationsCompatibility(
      tx,
      gymId,
      input,
    );
    if (!compatibility.ok) {
      return {
        ok: false,
        status: "conflict",
        message: compatibility.message,
      };
    }

    const row = await tx.gym.update({
      where: { id: gymId },
      data: {
        ...toGymData(input),
        sports: {
          deleteMany: {},
          create: toSportRows(input),
        },
      },
      include: { sports: true },
    });

    return {
      ok: true,
      gym: toAdminGym(row),
      message: "시설 정보가 저장되었습니다.",
    };
  });
}
