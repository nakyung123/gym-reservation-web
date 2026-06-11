import { describe, expect, it } from "vitest";
import type { Sport } from "@/types/domain";
import {
  cancelReservationAsAdminInDb,
  createReservationInDb,
  markReservationUsedInDb,
} from "@/lib/server/db-reservation-repository";
import { getRevenueSummary } from "@/lib/server/db-revenue-repository";
import { TEST_GYM, futureDate } from "@tests/setup-db";

async function createReservation({
  userId,
  sport,
  date,
  time,
}: {
  userId: string;
  sport: Sport;
  date: string;
  time: string;
}) {
  const created = await createReservationInDb({
    userId,
    draft: { gymId: TEST_GYM.id, sport, date, time },
    gym: TEST_GYM,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.message);
  return created.reservation;
}

describe("getRevenueSummary", () => {
  it("기간 내 예약을 시설별로 집계하고 expected/used 매출을 계산한다", async () => {
    const date1 = futureDate(7);
    const date2 = futureDate(8);

    const reserved = await createReservation({
      userId: "rev-user-a",
      sport: "배드민턴",
      date: date1,
      time: "10:00",
    });
    const usedOnDate1 = await createReservation({
      userId: "rev-user-b",
      sport: "배드민턴",
      date: date1,
      time: "11:00",
    });
    const cancelled = await createReservation({
      userId: "rev-user-c",
      sport: "배드민턴",
      date: date1,
      time: "12:00",
    });
    // 농구(15000)로 가격 다양성을 검증한다.
    const usedOnDate2 = await createReservation({
      userId: "rev-user-d",
      sport: "농구",
      date: date2,
      time: "10:00",
    });

    await markReservationUsedInDb(usedOnDate1.id);
    await markReservationUsedInDb(usedOnDate2.id);
    await cancelReservationAsAdminInDb(cancelled.id);

    const summary = await getRevenueSummary({ from: date1, to: date2 });

    expect(summary.from).toBe(date1);
    expect(summary.to).toBe(date2);
    expect(summary.counts).toEqual({
      total: 4,
      reserved: 1,
      cancelled: 1,
      used: 2,
    });
    expect(summary.revenue).toEqual({
      expected: reserved.price + usedOnDate1.price + usedOnDate2.price,
      used: usedOnDate1.price + usedOnDate2.price,
    });

    expect(summary.gyms).toHaveLength(1);
    expect(summary.gyms[0]).toEqual({
      gymId: TEST_GYM.id,
      gymName: TEST_GYM.name,
      counts: { total: 4, reserved: 1, cancelled: 1, used: 2 },
      revenue: {
        expected: reserved.price + usedOnDate1.price + usedOnDate2.price,
        used: usedOnDate1.price + usedOnDate2.price,
      },
    });
  });

  it("범위 밖 날짜의 예약은 제외한다", async () => {
    const date1 = futureDate(7);
    const date2 = futureDate(8);

    await createReservation({
      userId: "rev-range-a",
      sport: "배드민턴",
      date: date1,
      time: "10:00",
    });
    const outOfRange = await createReservation({
      userId: "rev-range-b",
      sport: "배드민턴",
      date: date2,
      time: "10:00",
    });
    await markReservationUsedInDb(outOfRange.id);

    // date1만 포함하는 범위 → date2의 used 예약은 빠진다.
    const summary = await getRevenueSummary({ from: date1, to: date1 });

    expect(summary.counts).toEqual({
      total: 1,
      reserved: 1,
      cancelled: 0,
      used: 0,
    });
    expect(summary.revenue).toEqual({ expected: 12000, used: 0 });
    expect(summary.gyms).toHaveLength(1);
  });

  it("기간에 예약이 없으면 빈 집계를 반환한다", async () => {
    const summary = await getRevenueSummary({
      from: "2020-01-01",
      to: "2020-01-31",
    });

    expect(summary.counts).toEqual({
      total: 0,
      reserved: 0,
      cancelled: 0,
      used: 0,
    });
    expect(summary.revenue).toEqual({ expected: 0, used: 0 });
    expect(summary.gyms).toEqual([]);
  });
});
