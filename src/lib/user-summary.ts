import { isReservationStatus } from "@/lib/domain-constants";
import type { ReservationStatus } from "@/types/domain";

export type UserReservationSummary = Record<ReservationStatus, number> & {
  total: number;
};

export type UserFavoriteSummary = {
  activeGymCount: number;
};

export type UserSummary = {
  userId: string;
  reservations: UserReservationSummary;
  favorites: UserFavoriteSummary;
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isUserReservationSummary(
  value: unknown,
): value is UserReservationSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<
    Record<ReservationStatus | "total", unknown>
  >;
  return (
    isCount(candidate.total) &&
    isCount(candidate.reserved) &&
    isCount(candidate.cancelled) &&
    isCount(candidate.used)
  );
}

export function isUserSummary(value: unknown): value is UserSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UserSummary>;
  const favorites = candidate.favorites;

  return (
    typeof candidate.userId === "string" &&
    isUserReservationSummary(candidate.reservations) &&
    Boolean(favorites) &&
    typeof favorites === "object" &&
    isCount(favorites.activeGymCount)
  );
}

export function createEmptyUserReservationSummary(): UserReservationSummary {
  return {
    total: 0,
    reserved: 0,
    cancelled: 0,
    used: 0,
  };
}

export function addReservationStatusCount(
  summary: UserReservationSummary,
  status: string,
  count: number,
): void {
  if (!isReservationStatus(status)) {
    throw new Error(`알 수 없는 예약 상태입니다: ${status}`);
  }
  summary[status] = count;
  summary.total += count;
}
