import { describe, expect, it } from "vitest";
import { mysqlGymRepository } from "@/lib/mysql-gym-repository";
import {
  createAdminGym,
  listAdminGyms,
  updateAdminGym,
} from "@/lib/server/mysql-gym-admin-repository";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import type { AdminGym } from "@/types/domain";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminGym: AdminGym = {
  ...TEST_GYM,
  id: "admin-managed-gym",
  name: "관리자 등록 체육관",
  isActive: true,
};

describe("mysql gym admin repository", () => {
  it("관리자가 시설을 추가하면 관리자 목록과 공개 목록에 반영된다", async () => {
    const created = await createAdminGym(adminGym);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.gym.id).toBe(adminGym.id);
    expect(created.gym.isActive).toBe(true);

    const adminGyms = await listAdminGyms();
    expect(adminGyms.some((gym) => gym.id === adminGym.id)).toBe(true);

    const publicGym = await mysqlGymRepository.findById(adminGym.id);
    expect(publicGym?.name).toBe(adminGym.name);
  });

  it("비활성 시설은 관리자 목록에는 남고 공개 목록에서는 제외된다", async () => {
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.gym.isActive).toBe(false);

    const adminGyms = await listAdminGyms();
    const adminRow = adminGyms.find((gym) => gym.id === TEST_GYM.id);
    expect(adminRow?.isActive).toBe(false);

    const publicGym = await mysqlGymRepository.findById(TEST_GYM.id);
    expect(publicGym).toBeNull();

    const publicGyms = await mysqlGymRepository.list();
    expect(publicGyms.some((gym) => gym.id === TEST_GYM.id)).toBe(false);
  });

  it("예약 완료 상태의 예약이 남아 있으면 시설 비활성화를 거부한다", async () => {
    const created = await createReservationInMysql({
      userId: "admin-gym-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });

    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.status).toBe("conflict");

    const publicGym = await mysqlGymRepository.findById(TEST_GYM.id);
    expect(publicGym?.id).toBe(TEST_GYM.id);
  });

  it("예약 완료 상태의 예약 종목은 시설 정보에서 제거할 수 없다", async () => {
    const reservedSport = TEST_GYM.sports[0];
    const created = await createReservationInMysql({
      userId: "admin-gym-sport-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: reservedSport,
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      sports: TEST_GYM.sports.filter((sport) => sport !== reservedSport),
      sportPrices: Object.fromEntries(
        Object.entries(TEST_GYM.sportPrices).filter(
          ([sport]) => sport !== reservedSport,
        ),
      ),
      isActive: true,
    });

    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.status).toBe("conflict");

    const publicGym = await mysqlGymRepository.findById(TEST_GYM.id);
    expect(publicGym?.sports).toContain(reservedSport);
  });

  it("예약 완료 상태의 예약 시간은 시설 정보에서 제거할 수 없다", async () => {
    const reservedTime = "10:00";
    const created = await createReservationInMysql({
      userId: "admin-gym-time-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: reservedTime,
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      availableTimes: TEST_GYM.availableTimes.filter(
        (time) => time !== reservedTime,
      ),
      isActive: true,
    });

    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.status).toBe("conflict");

    const publicGym = await mysqlGymRepository.findById(TEST_GYM.id);
    expect(publicGym?.availableTimes).toContain(reservedTime);
  });
});
