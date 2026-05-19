import { describe, expect, it } from "vitest";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { getUserSummary } from "@/lib/server/mysql-user-summary-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

describe("getUserSummary", () => {
  it("사용자 데이터가 없으면 빈 요약을 반환한다", async () => {
    await expect(getUserSummary("empty-summary-user")).resolves.toEqual({
      userId: "empty-summary-user",
      reservations: {
        total: 0,
        reserved: 0,
        cancelled: 0,
        used: 0,
      },
      favorites: {
        activeGymCount: 0,
      },
    });
  });

  it("로그인 사용자 기준 예약 상태와 활성 즐겨찾기 수를 집계한다", async () => {
    const userId = "summary-user-a";
    const otherUserId = "summary-user-b";
    const date = futureDate();

    const reserved = await createReservationInMysql({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    const cancelled = await createReservationInMysql({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "11:00",
      },
      gym: TEST_GYM,
    });
    const used = await createReservationInMysql({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "12:00",
      },
      gym: TEST_GYM,
    });
    const other = await createReservationInMysql({
      userId: otherUserId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "14:00",
      },
      gym: TEST_GYM,
    });
    expect(reserved.ok).toBe(true);
    expect(cancelled.ok).toBe(true);
    expect(used.ok).toBe(true);
    expect(other.ok).toBe(true);
    if (!reserved.ok || !cancelled.ok || !used.ok || !other.ok) return;

    await prisma.reservation.update({
      where: { id: cancelled.reservation.id },
      data: { status: "cancelled" },
    });
    await prisma.reservation.update({
      where: { id: used.reservation.id },
      data: { status: "used" },
    });
    await prisma.favorite.createMany({
      data: [
        { userId, gymId: TEST_GYM.id },
        { userId: otherUserId, gymId: TEST_GYM.id },
      ],
    });

    await expect(getUserSummary(userId)).resolves.toEqual({
      userId,
      reservations: {
        total: 3,
        reserved: 1,
        cancelled: 1,
        used: 1,
      },
      favorites: {
        activeGymCount: 1,
      },
    });
  });

  it("비활성 체육관 즐겨찾기는 요약 수에서 제외한다", async () => {
    const userId = "summary-inactive-favorite-user";
    await prisma.favorite.create({
      data: { userId, gymId: TEST_GYM.id },
    });
    await prisma.gym.update({
      where: { id: TEST_GYM.id },
      data: { isActive: false },
    });

    const summary = await getUserSummary(userId);

    expect(summary.favorites.activeGymCount).toBe(0);
  });
});
