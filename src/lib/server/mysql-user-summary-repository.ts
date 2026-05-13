import "server-only";
import { prisma } from "@/lib/server/prisma-client";
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

function emptyReservationSummary(): UserReservationSummary {
  return {
    total: 0,
    reserved: 0,
    cancelled: 0,
    used: 0,
  };
}

export async function getUserSummary(userId: string): Promise<UserSummary> {
  const [reservationRows, activeFavoriteGymCount] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.favorite.count({
      where: { userId, gym: { isActive: true } },
    }),
  ]);

  const reservations = emptyReservationSummary();
  for (const row of reservationRows) {
    if (!isReservationStatus(row.status)) {
      throw new Error(`알 수 없는 예약 상태입니다: ${row.status}`);
    }
    reservations[row.status] = row._count._all;
    reservations.total += row._count._all;
  }

  return {
    userId,
    reservations,
    favorites: { activeGymCount: activeFavoriteGymCount },
  };
}
