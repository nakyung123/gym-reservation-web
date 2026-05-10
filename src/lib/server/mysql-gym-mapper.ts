import "server-only";
import { Prisma } from "@prisma/client";
import { ADMIN_GYM_SPORTS, isSport } from "@/lib/admin/admin-gym-schema";
import type { AdminGym, Gym, Sport } from "@/types/domain";

export type GymRowWithSports = Prisma.GymGetPayload<{
  include: { sports: true };
}>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseSportPrices(
  value: Prisma.JsonValue,
  gymId: string,
): Partial<Record<Sport, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`체육관 ${gymId}의 sportPrices 형식이 올바르지 않습니다.`);
  }

  const result: Partial<Record<Sport, number>> = {};

  for (const [sport, price] of Object.entries(value)) {
    if (!isSport(sport) || typeof price !== "number" || !Number.isFinite(price)) {
      throw new Error(
        `체육관 ${gymId}의 sportPrices 항목이 올바르지 않습니다: ${sport}`,
      );
    }
    result[sport] = price;
  }

  return result;
}

function parseStringArrayField(
  value: Prisma.JsonValue,
  field: string,
  gymId: string,
): string[] {
  if (!isStringArray(value)) {
    throw new Error(`체육관 ${gymId}의 ${field} 형식이 올바르지 않습니다.`);
  }
  return value;
}

export function toDomainGym(row: GymRowWithSports): Gym {
  const sportNames: Sport[] = [];
  for (const entry of row.sports) {
    if (!isSport(entry.sport)) {
      throw new Error(
        `체육관 ${row.id}의 sports에 알 수 없는 종목이 있습니다: ${entry.sport}`,
      );
    }
    sportNames.push(entry.sport);
  }

  const sortedSports = ADMIN_GYM_SPORTS.filter((sport) =>
    sportNames.includes(sport),
  );

  return {
    id: row.id,
    name: row.name,
    region: row.region,
    address: row.address,
    officialUrl: row.officialUrl,
    openHours: row.openHours,
    basePrice: row.basePrice,
    sports: sortedSports,
    sportPrices: parseSportPrices(row.sportPrices, row.id),
    facilities: parseStringArrayField(row.facilities, "facilities", row.id),
    availableTimes: parseStringArrayField(
      row.availableTimes,
      "availableTimes",
      row.id,
    ),
    closedDays: parseStringArrayField(row.closedDays, "closedDays", row.id),
    distanceKm: row.distanceKm.toNumber(),
    description: row.description,
  };
}

export function toAdminGym(row: GymRowWithSports): AdminGym {
  return {
    ...toDomainGym(row),
    isActive: row.isActive,
  };
}
