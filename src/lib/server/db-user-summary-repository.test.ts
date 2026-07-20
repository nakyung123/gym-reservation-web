import { describe, expect, it } from "vitest";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { getUserSummary } from "@/lib/server/db-user-summary-repository";
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
      reservationCountByGym: {},
    });
  });

  it("로그인 사용자 기준 예약 상태와 활성 즐겨찾기 수를 집계한다", async () => {
    const userId = "summary-user-a";
    const otherUserId = "summary-user-b";
    const date = futureDate();

    const reserved = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    const cancelled = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "11:00",
      },
      gym: TEST_GYM,
    });
    const used = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date,
        time: "12:00",
      },
      gym: TEST_GYM,
    });
    const other = await createReservationInDb({
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
      reservationCountByGym: { [TEST_GYM.id]: 3 },
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

describe("getUserSummary reservationCountByGym", () => {
  it("시설별 예약 횟수를 상태 무관으로 집계한다", async () => {
    const userId = "summary-gym-count-user";
    // 같은 시설에 상태가 다른 예약 3건. 취소·이용완료도 "예약해 본 횟수"에 포함한다.
    for (const [index, status] of ["reserved", "cancelled", "used"].entries()) {
      await prisma.reservation.create({
        data: {
          id: `${userId}-${index}`,
          userId,
          gymId: TEST_GYM.id,
          sport: TEST_GYM.sports[0],
          date: futureDate(index + 1),
          time: "10:00",
          price: 10000,
          status,
          activeKey: `${userId}-${index}-key`,
        },
      });
    }

    const summary = await getUserSummary(userId);

    expect(summary.reservationCountByGym).toEqual({ [TEST_GYM.id]: 3 });
  });

  it("다른 사용자의 예약은 집계하지 않는다", async () => {
    const userId = "summary-gym-count-scope-user";
    await prisma.reservation.create({
      data: {
        id: `${userId}-other`,
        userId: "summary-gym-count-someone-else",
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(1),
        time: "11:00",
        price: 10000,
        status: "reserved",
        activeKey: `${userId}-other-key`,
      },
    });

    const summary = await getUserSummary(userId);

    expect(summary.reservationCountByGym).toEqual({});
  });
});
