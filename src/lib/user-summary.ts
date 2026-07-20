import { isReservationStatus } from "@/lib/domain-constants";
import type { ReservationStatus } from "@/types/domain";

export type UserReservationSummary = Record<ReservationStatus, number> & {
  total: number;
};

export type UserFavoriteSummary = {
  activeGymCount: number;
};

/**
 * 시설별 예약 횟수(gymId → 건수). 상태 무관(취소 포함)이며, 예약이 0건인 시설은 담지 않는다.
 *
 * 키 개수는 사용자가 예약해 본 시설 수라 체육관 총수로 상한이 잡힌다(예약 건수와 무관).
 * 그래서 이 값을 클라이언트가 예약 목록 전체를 받아 집계하지 않고 서버 집계로 받는다.
 */
export type UserGymBookingCounts = Record<string, number>;

export type UserSummary = {
  userId: string;
  reservations: UserReservationSummary;
  favorites: UserFavoriteSummary;
  reservationCountByGym: UserGymBookingCounts;
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

export function isUserGymBookingCounts(
  value: unknown,
): value is UserGymBookingCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isCount);
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
    isCount(favorites.activeGymCount) &&
    isUserGymBookingCounts(candidate.reservationCountByGym)
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
