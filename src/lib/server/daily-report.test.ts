import { describe, expect, it } from "vitest";
import {
  collectAiBriefInput,
  collectDailyReport,
} from "@/lib/server/daily-report";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-db";

// 고정 시각: 2026-06-16T03:00Z = KST 2026-06-16 12:00.
// 따라서 "어제(KST)" = 2026-06-15, createdAt 구간 = [2026-06-14T15:00Z, 2026-06-15T15:00Z).
const NOW = new Date("2026-06-16T03:00:00.000Z");
const IN_WINDOW = new Date("2026-06-15T02:00:00.000Z"); // KST 6/15 11:00 → 포함
const BEFORE_WINDOW = new Date("2026-06-14T10:00:00.000Z"); // KST 6/14 19:00 → 제외
const TODAY_CREATED = new Date("2026-06-15T16:00:00.000Z"); // KST 6/16 01:00 → 어제 아님
// baseline(어제 직전 7일) 구간 [2026-06-07T15:00Z, 2026-06-14T15:00Z) 내부.
const BASELINE_IN = new Date("2026-06-10T02:00:00.000Z");

async function seedReservation(input: {
  id: string;
  date: string;
  time: string;
  price: number;
  status: string;
  createdAt: Date;
}) {
  await prisma.reservation.create({
    data: {
      id: input.id,
      userId: `u-${input.id}`,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date: input.date,
      time: input.time,
      price: input.price,
      status: input.status,
      createdAt: input.createdAt,
      activeKey: `ak-${input.id}`,
    },
  });
}

describe("collectDailyReport", () => {
  it("어제 생성 지표는 createdAt 구간으로만(상태 무관) 집계하고, 오늘 일정은 date 기준으로 센다", async () => {
    // 어제 생성된 예약 2건 — 1건은 오늘 취소됐어도(상태 cancelled) 어제 카운트에 남아야 한다(멱등).
    await seedReservation({
      id: "res-yday-reserved",
      date: "2026-07-10",
      time: "10:00",
      price: 12000,
      status: "reserved",
      createdAt: IN_WINDOW,
    });
    await seedReservation({
      id: "res-yday-cancelled",
      date: "2026-07-11",
      time: "11:00",
      price: 15000,
      status: "cancelled",
      createdAt: IN_WINDOW,
    });
    // 오늘 생성 + 오늘 일정 — 어제 카운트에선 빠지고, 오늘 예약 일정(date=오늘)에는 잡혀야 한다.
    await seedReservation({
      id: "res-today",
      date: "2026-06-16",
      time: "14:00",
      price: 50000,
      status: "reserved",
      createdAt: TODAY_CREATED,
    });

    // 신규 가입: 어제 1건 + 그 전 1건(제외)
    await prisma.userProfile.create({
      data: { userId: "p-in", preferredSports: [], createdAt: IN_WINDOW },
    });
    await prisma.userProfile.create({
      data: { userId: "p-out", preferredSports: [], createdAt: BEFORE_WINDOW },
    });

    // 신규 즐겨찾기: 어제 1건 + 그 전 1건(제외)
    await prisma.favorite.create({
      data: { userId: "f-in", gymId: TEST_GYM.id, createdAt: IN_WINDOW },
    });
    await prisma.favorite.create({
      data: { userId: "f-out", gymId: TEST_GYM.id, createdAt: BEFORE_WINDOW },
    });

    // 탈퇴: 어제 1건 + 그 전 1건(제외)
    await prisma.withdrawalReason.create({
      data: { category: "기타", createdAt: IN_WINDOW },
    });
    await prisma.withdrawalReason.create({
      data: { category: "기타", createdAt: BEFORE_WINDOW },
    });

    const data = await collectDailyReport({ now: NOW });

    expect(data.yesterdayKstDate).toBe("2026-06-15");
    expect(data.todayKstDate).toBe("2026-06-16");
    // reserved + cancelled 둘 다 포함(상태 무관). res-today는 createdAt이 구간 밖이라 제외.
    expect(data.newReservations).toBe(2);
    expect(data.bookedValueWon).toBe(27000);
    expect(data.newSignups).toBe(1);
    expect(data.newFavorites).toBe(1);
    expect(data.withdrawals).toBe(1);
    // 오늘(2026-06-16) date의 reserved 예약 스냅샷 = res-today 1건.
    expect(data.todayReservedCount).toBe(1);
  });

  it("활동이 전혀 없으면 모든 지표가 0이다", async () => {
    const data = await collectDailyReport({ now: NOW });
    expect(data).toMatchObject({
      newReservations: 0,
      bookedValueWon: 0,
      newSignups: 0,
      newFavorites: 0,
      withdrawals: 0,
      todayReservedCount: 0,
    });
  });
});

describe("collectAiBriefInput", () => {
  it("baseline 일평균과 어제 탈퇴 사유(자유텍스트)를 모은다", async () => {
    // baseline 구간 예약 7건 → 1.0/일. 날짜를 달리해 슬롯 충돌을 피한다.
    for (let i = 0; i < 7; i++) {
      await seedReservation({
        id: `base-${i}`,
        date: `2026-07-0${i + 1}`,
        time: "10:00",
        price: 10000,
        status: "reserved",
        createdAt: BASELINE_IN,
      });
    }
    // 어제 탈퇴 사유 2건(detail 포함/누락) — baseline 밖, 어제 안.
    await prisma.withdrawalReason.create({
      data: { category: "가격", detail: "너무 비쌈", createdAt: IN_WINDOW },
    });
    await prisma.withdrawalReason.create({
      data: { category: "시설", detail: null, createdAt: IN_WINDOW },
    });
    // baseline 구간 탈퇴 1건 → withdrawalsPerDay = 1/7 ≈ 0.1.
    await prisma.withdrawalReason.create({
      data: { category: "기타", createdAt: BASELINE_IN },
    });

    const data = await collectDailyReport({ now: NOW });
    const brief = await collectAiBriefInput(data, { now: NOW });

    expect(brief.yesterdayKstDate).toBe("2026-06-15");
    expect(brief.baseline.reservationsPerDay).toBe(1);
    expect(brief.baseline.withdrawalsPerDay).toBe(0.1);
    // 어제 지표(탈퇴 사유)는 baseline과 분리된다.
    expect(brief.metrics.withdrawals).toBe(2);
    expect(brief.withdrawalReasons).toHaveLength(2);
    expect(brief.withdrawalReasons.map((reason) => reason.category).sort()).toEqual(
      ["가격", "시설"],
    );
  });
});
