import { describe, expect, it } from "vitest";
import {
  getCustomerCoreDetail,
  listCustomers,
} from "@/lib/server/db-customer-repository";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

async function createProfile(userId: string, nickname: string, provider: string) {
  await prisma.userProfile.create({
    data: { userId, nickname, provider, preferredSports: [] },
  });
}

describe("listCustomers", () => {
  it("UserProfile 기준으로 예약 수와 활성 즐겨찾기 수를 집계한다", async () => {
    await createProfile("cust-a", "고객에이", "google");
    await createProfile("cust-b", "고객비", "kakao");

    const date = futureDate();
    const first = await createReservationInDb({
      userId: "cust-a",
      draft: { gymId: TEST_GYM.id, sport: TEST_GYM.sports[0], date, time: "10:00" },
      gym: TEST_GYM,
    });
    const second = await createReservationInDb({
      userId: "cust-a",
      draft: { gymId: TEST_GYM.id, sport: TEST_GYM.sports[0], date, time: "11:00" },
      gym: TEST_GYM,
    });
    expect(first.ok && second.ok).toBe(true);
    await prisma.favorite.create({
      data: { userId: "cust-a", gymId: TEST_GYM.id },
    });

    const customers = await listCustomers();
    expect(customers).toHaveLength(2);

    const custA = customers.find((c) => c.userId === "cust-a");
    const custB = customers.find((c) => c.userId === "cust-b");
    expect(custA).toMatchObject({
      nickname: "고객에이",
      provider: "google",
      reservationCount: 2,
      activeFavoriteCount: 1,
    });
    expect(custB).toMatchObject({
      reservationCount: 0,
      activeFavoriteCount: 0,
    });

    // tie-safe: createdAt 단조 감소(desc) 확인.
    for (let i = 0; i < customers.length - 1; i += 1) {
      expect(customers[i].createdAt >= customers[i + 1].createdAt).toBe(true);
    }
  });

  it("비활성 체육관 즐겨찾기는 집계에서 제외한다", async () => {
    await createProfile("cust-inactive-fav", "비활성팬", "local");
    await prisma.favorite.create({
      data: { userId: "cust-inactive-fav", gymId: TEST_GYM.id },
    });
    await prisma.gym.update({
      where: { id: TEST_GYM.id },
      data: { isActive: false },
    });

    const customers = await listCustomers();
    const target = customers.find((c) => c.userId === "cust-inactive-fav");
    expect(target?.activeFavoriteCount).toBe(0);
  });

  it("q로 닉네임을 부분 검색한다", async () => {
    await createProfile("cust-search-1", "농구왕", "google");
    await createProfile("cust-search-2", "배드민턴고수", "kakao");

    const result = await listCustomers({ q: "농구" });
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("cust-search-1");
  });

  it("프로필이 없으면 빈 목록을 반환한다", async () => {
    await expect(listCustomers()).resolves.toEqual([]);
  });
});

describe("getCustomerCoreDetail", () => {
  it("프로필과 예약 상태 집계, 활성 즐겨찾기 수를 반환한다", async () => {
    await createProfile("detail-user", "상세고객", "naver");

    const date = futureDate();
    const reserved = await createReservationInDb({
      userId: "detail-user",
      draft: { gymId: TEST_GYM.id, sport: TEST_GYM.sports[0], date, time: "10:00" },
      gym: TEST_GYM,
    });
    const used = await createReservationInDb({
      userId: "detail-user",
      draft: { gymId: TEST_GYM.id, sport: TEST_GYM.sports[0], date, time: "11:00" },
      gym: TEST_GYM,
    });
    expect(reserved.ok && used.ok).toBe(true);
    if (!used.ok) return;
    await prisma.reservation.update({
      where: { id: used.reservation.id },
      data: { status: "used" },
    });
    await prisma.favorite.create({
      data: { userId: "detail-user", gymId: TEST_GYM.id },
    });

    const detail = await getCustomerCoreDetail("detail-user");
    expect(detail.profile).toMatchObject({
      nickname: "상세고객",
      provider: "naver",
      hasPhoto: false,
    });
    expect(detail.reservations).toEqual({
      total: 2,
      reserved: 1,
      cancelled: 0,
      used: 1,
    });
    expect(detail.activeFavoriteCount).toBe(1);
  });

  it("프로필이 없어도 예약 집계는 반환하고 profile은 null이다", async () => {
    const date = futureDate();
    const created = await createReservationInDb({
      userId: "no-profile-user",
      draft: { gymId: TEST_GYM.id, sport: TEST_GYM.sports[0], date, time: "10:00" },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const detail = await getCustomerCoreDetail("no-profile-user");
    expect(detail.profile).toBeNull();
    expect(detail.reservations.total).toBe(1);
    expect(detail.reservations.reserved).toBe(1);
  });
});
