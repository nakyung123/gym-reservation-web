import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import {
  addReservationStatusCount,
  createEmptyUserReservationSummary,
  type UserSummary,
} from "@/lib/user-summary";

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

  const reservations = createEmptyUserReservationSummary();
  for (const row of reservationRows) {
    addReservationStatusCount(reservations, row.status, row._count._all);
  }

  return {
    userId,
    reservations,
    favorites: { activeGymCount: activeFavoriteGymCount },
  };
}
