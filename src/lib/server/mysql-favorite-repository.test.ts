import { describe, expect, it } from "vitest";
import {
  addFavorite,
  listFavoriteGymIds,
  removeFavorite,
} from "@/lib/server/mysql-favorite-repository";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-mysql";

const userA = "favorite-repo-user-a";
const userB = "favorite-repo-user-b";

async function createExtraGym(id: string) {
  await prisma.gym.create({
    data: {
      id,
      name: `${TEST_GYM.name} ${id}`,
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
      sports: {
        create: TEST_GYM.sports.map((sport) => ({ sport })),
      },
    },
  });
}

describe("mysql favorite repository", () => {
  it("lists only the requested user's favorite gym IDs in newest-first order", async () => {
    const oldGymId = "favorite-old-gym";
    const newGymId = "favorite-new-gym";
    await createExtraGym(oldGymId);
    await createExtraGym(newGymId);

    await prisma.favorite.createMany({
      data: [
        {
          userId: userA,
          gymId: oldGymId,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          userId: userA,
          gymId: newGymId,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          userId: userB,
          gymId: TEST_GYM.id,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ],
    });

    await expect(listFavoriteGymIds(userA)).resolves.toEqual([
      newGymId,
      oldGymId,
    ]);
  });

  it("does not list inactive gyms in public favorites", async () => {
    await prisma.favorite.create({
      data: { userId: userA, gymId: TEST_GYM.id },
    });
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    await expect(listFavoriteGymIds(userA)).resolves.toEqual([]);
  });

  it("adds a favorite once and treats repeated adds as already done", async () => {
    await expect(addFavorite(userA, TEST_GYM.id)).resolves.toBe("added");
    await expect(addFavorite(userA, TEST_GYM.id)).resolves.toBe("already");

    await expect(
      prisma.favorite.count({
        where: { userId: userA, gymId: TEST_GYM.id },
      }),
    ).resolves.toBe(1);
  });

  it("returns gym-not-found when adding a missing gym", async () => {
    await expect(addFavorite(userA, "missing-gym")).resolves.toBe(
      "gym-not-found",
    );
    await expect(prisma.favorite.count()).resolves.toBe(0);
  });

  it("returns gym-not-found when adding an inactive gym", async () => {
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    await expect(addFavorite(userA, TEST_GYM.id)).resolves.toBe(
      "gym-not-found",
    );
    await expect(prisma.favorite.count()).resolves.toBe(0);
  });

  it("removes a favorite idempotently", async () => {
    await addFavorite(userA, TEST_GYM.id);

    await removeFavorite(userA, TEST_GYM.id);
    await removeFavorite(userA, TEST_GYM.id);

    await expect(
      prisma.favorite.count({
        where: { userId: userA, gymId: TEST_GYM.id },
      }),
    ).resolves.toBe(0);
  });

  it("does not remove another user's favorite for the same gym", async () => {
    await addFavorite(userA, TEST_GYM.id);
    await addFavorite(userB, TEST_GYM.id);

    await removeFavorite(userA, TEST_GYM.id);

    await expect(listFavoriteGymIds(userA)).resolves.toEqual([]);
    await expect(listFavoriteGymIds(userB)).resolves.toEqual([TEST_GYM.id]);
  });
});
