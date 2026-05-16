import { describe, expect, it } from "vitest";
import {
  migrateAnonymousToTarget,
  MigrationConflictError,
} from "@/lib/server/account-migration";
import { prisma } from "@/lib/server/prisma-client";
import { getReservationActiveKey } from "@/lib/reservation-repository";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const ANON = "anon-uid-1";
const TARGET = "kakao:1234567";

async function createReservation(input: {
  userId: string;
  gymId?: string;
  sport?: string;
  date?: string;
  time?: string;
  status?: string;
  withLock?: boolean;
  id?: string;
}) {
  const reservation = {
    id: input.id ?? `res-${Math.random().toString(36).slice(2, 10)}`,
    userId: input.userId,
    gymId: input.gymId ?? TEST_GYM.id,
    sport: input.sport ?? "배드민턴",
    date: input.date ?? futureDate(7),
    time: input.time ?? "10:00",
    price: 12000,
    status: input.status ?? "reserved",
    createdAt: new Date(),
  };
  const activeKey = getReservationActiveKey(reservation);
  await prisma.reservation.create({
    data: {
      ...reservation,
      activeKey,
    },
  });
  if (input.withLock !== false && reservation.status === "reserved") {
    await prisma.reservationLock.create({
      data: {
        activeKey,
        reservationId: reservation.id,
        status: "reserved",
      },
    });
  }
  return { ...reservation, activeKey };
}

describe("migrateAnonymousToTarget", () => {
  it("UserProfile만 있을 때 target으로 이전된다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: ANON,
        nickname: "닉",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });

    await migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET });

    expect(await prisma.userProfile.findUnique({ where: { userId: ANON } })).toBeNull();
    const moved = await prisma.userProfile.findUnique({ where: { userId: TARGET } });
    expect(moved?.nickname).toBe("닉");
  });

  it("Favorite은 새 gymId는 옮기고, target에 이미 있는 gymId는 anon 행만 삭제(중복 제거)", async () => {
    await prisma.gym.create({
      data: {
        id: "gym-extra",
        name: "추가 체육관",
        region: TEST_GYM.region,
        address: TEST_GYM.address,
        officialUrl: TEST_GYM.officialUrl,
        openHours: TEST_GYM.openHours,
        basePrice: TEST_GYM.basePrice,
        description: TEST_GYM.description,
        distanceKm: TEST_GYM.distanceKm,
        sportPrices: TEST_GYM.sportPrices,
        facilities: TEST_GYM.facilities,
        availableTimes: TEST_GYM.availableTimes,
        closedDays: TEST_GYM.closedDays,
        sports: { create: TEST_GYM.sports.map((sport) => ({ sport })) },
      },
    });
    await prisma.favorite.createMany({
      data: [
        { userId: ANON, gymId: TEST_GYM.id },
        { userId: ANON, gymId: "gym-extra" },
        { userId: TARGET, gymId: TEST_GYM.id }, // 중복 케이스
      ],
    });

    await migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET });

    const anonAfter = await prisma.favorite.findMany({ where: { userId: ANON } });
    expect(anonAfter).toHaveLength(0);
    const targetAfter = await prisma.favorite.findMany({ where: { userId: TARGET } });
    expect(targetAfter.map((f) => f.gymId).sort()).toEqual(
      [TEST_GYM.id, "gym-extra"].sort(),
    );
  });

  it("Reservation과 ReservationLock은 userId/activeKey가 재계산되어 이전된다", async () => {
    const created = await createReservation({ userId: ANON });

    await migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET });

    const anonAfter = await prisma.reservation.findMany({ where: { userId: ANON } });
    expect(anonAfter).toHaveLength(0);

    const targetAfter = await prisma.reservation.findUnique({
      where: { id: created.id },
    });
    expect(targetAfter?.userId).toBe(TARGET);
    const expectedActiveKey = getReservationActiveKey({
      ...created,
      userId: TARGET,
    });
    expect(targetAfter?.activeKey).toBe(expectedActiveKey);

    const oldLock = await prisma.reservationLock.findUnique({
      where: { activeKey: created.activeKey },
    });
    expect(oldLock).toBeNull();
    const newLock = await prisma.reservationLock.findUnique({
      where: { activeKey: expectedActiveKey },
    });
    expect(newLock?.reservationId).toBe(created.id);
  });

  it("같은 슬롯이 target에 이미 있으면 MigrationConflictError를 던지고 트랜잭션을 롤백한다", async () => {
    const anonRes = await createReservation({
      userId: ANON,
      time: "11:00",
    });
    await createReservation({
      userId: TARGET,
      time: "11:00",
      id: "target-clash",
    });

    await expect(
      migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET }),
    ).rejects.toBeInstanceOf(MigrationConflictError);

    // 트랜잭션 롤백 검증: anon 데이터 그대로
    const anonStill = await prisma.reservation.findUnique({
      where: { id: anonRes.id },
    });
    expect(anonStill?.userId).toBe(ANON);
    expect(anonStill?.activeKey).toBe(anonRes.activeKey);
  });

  it("UserProfile이 양쪽에 모두 있으면 MigrationConflictError를 던진다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: ANON,
        nickname: "anon",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
    await prisma.userProfile.create({
      data: {
        userId: TARGET,
        nickname: "target",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });

    await expect(
      migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET }),
    ).rejects.toBeInstanceOf(MigrationConflictError);
  });

  it("두 번 호출해도 idempotent하게 동작한다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: ANON,
        nickname: "닉",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
    await createReservation({ userId: ANON });

    await migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET });
    // 두 번째 호출은 옮길 게 없으므로 에러 없이 끝나야 한다.
    await migrateAnonymousToTarget({ anonUid: ANON, targetUid: TARGET });

    const targetProfile = await prisma.userProfile.findUnique({
      where: { userId: TARGET },
    });
    expect(targetProfile?.nickname).toBe("닉");
    const targetReservations = await prisma.reservation.findMany({
      where: { userId: TARGET },
    });
    expect(targetReservations).toHaveLength(1);
  });

  it("anonUid와 targetUid가 같으면 오류", async () => {
    await expect(
      migrateAnonymousToTarget({ anonUid: ANON, targetUid: ANON }),
    ).rejects.toThrow(/달라야/);
  });
});
