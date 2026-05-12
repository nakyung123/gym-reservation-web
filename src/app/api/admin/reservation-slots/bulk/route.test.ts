import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach } from "vitest";
import { PATCH } from "@/app/api/admin/reservation-slots/bulk/route";
import {
  createReservationInMysql,
  RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT,
} from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

type BulkSlotPolicyBody = {
  gymId: string;
  sport: "배드민턴";
  dates: string[];
  times: string[];
  capacity?: number;
  isClosed?: boolean;
};

function requestFor(body: BulkSlotPolicyBody, token = adminToken): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/admin/reservation-slots/bulk",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/admin/reservation-slots/bulk", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 여러 슬롯 정책을 한 번에 변경한다", async () => {
    const firstDate = futureDate();
    const secondDate = futureDate(8);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [firstDate, secondDate],
        times: ["10:00", "11:00"],
        capacity: 7,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slots?: unknown[];
      updatedCount?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.updatedCount).toBe(4);
    expect(body.slots).toHaveLength(4);

    const rows = await prisma.reservationSlot.findMany({
      where: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: { in: [firstDate, secondDate] },
        time: { in: ["10:00", "11:00"] },
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.capacity === 7)).toBe(true);
    expect(rows.every((row) => row.isClosed)).toBe(true);
  });

  it("관리자 토큰이 없으면 변경하지 않는다", async () => {
    const response = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/admin/reservation-slots/bulk",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gymId: TEST_GYM.id,
            sport: "배드민턴",
            dates: [futureDate()],
            times: ["10:00"],
            isClosed: true,
          }),
        },
      ),
    );

    expect(response.status).toBe(401);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("대상 슬롯 수가 제한을 넘으면 400을 반환한다", async () => {
    const dates = Array.from(
      { length: RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT + 1 },
      (_, index) => futureDate(index + 1),
    );

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates,
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      `한 번에 변경할 수 있는 슬롯은 최대 ${RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT}개입니다.`,
    );
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("충돌이 있으면 409와 conflicts를 반환하고 전체 변경을 거부한다", async () => {
    const date = futureDate();
    const reservedDraft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };
    const first = await createReservationInMysql({
      userId: "route-user-a",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const second = await createReservationInMysql({
      userId: "route-user-b",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [date],
        times: ["10:00", "11:00"],
        capacity: 1,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      conflicts?: Array<{ time?: unknown; reservedCount?: unknown }>;
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts?.[0]).toMatchObject({
      time: "10:00",
      reservedCount: 2,
    });

    const untouchedSlot = await prisma.reservationSlot.findUnique({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "11:00",
        },
      },
    });
    expect(untouchedSlot).toBeNull();
  });
});
