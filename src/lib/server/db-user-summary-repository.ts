import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import {
  addReservationStatusCount,
  createEmptyUserReservationSummary,
  type UserSummary,
} from "@/lib/user-summary";

export async function getUserSummary(userId: string): Promise<UserSummary> {
  const [reservationRows, activeFavoriteGymCount, gymRows] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.favorite.count({
      where: { userId, gym: { isActive: true } },
    }),
    // 시설별 예약 횟수(상태 무관). 마이페이지 즐겨찾기 표가 쓰던 집계를 서버로 옮긴 것이다.
    // 클라이언트가 예약 목록 전체를 받아 세지 않아도 되며, 결과 크기는 시설 수로 제한된다.
    prisma.reservation.groupBy({
      by: ["gymId"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const reservations = createEmptyUserReservationSummary();
  for (const row of reservationRows) {
    addReservationStatusCount(reservations, row.status, row._count._all);
  }

  const reservationCountByGym: Record<string, number> = {};
  for (const row of gymRows) {
    reservationCountByGym[row.gymId] = row._count._all;
  }

  return {
    userId,
    reservations,
    favorites: { activeGymCount: activeFavoriteGymCount },
    reservationCountByGym,
  };
}
