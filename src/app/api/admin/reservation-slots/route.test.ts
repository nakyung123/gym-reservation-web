import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/admin/reservation-slots/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

type SlotPolicyBody = {
  gymId: string;
  sport: "배드민턴";
  date: string;
  time: string;
  capacity?: number;
  isClosed?: boolean;
};

function requestFor(body: SlotPolicyBody, token = adminToken): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/reservation-slots", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 단일 슬롯 정책을 변경한다", async () => {
    const date = futureDate();

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
        capacity: 8,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slot?: { capacity?: unknown; isClosed?: unknown; status?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.slot).toMatchObject({
      capacity: 8,
      isClosed: true,
      status: "closed",
    });

    const row = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(row.capacity).toBe(8);
    expect(row.isClosed).toBe(true);
  });

  it("관리자 토큰이 없으면 변경하지 않는다", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: futureDate(),
          time: "10:00",
          isClosed: true,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("정원 범위가 올바르지 않으면 400을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 1000,
      }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("이미 예약된 인원보다 낮은 정원으로 줄이면 409를 반환한다", async () => {
    const date = futureDate();
    const reservedDraft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };
    const first = await createReservationInMysql({
      userId: "slot-route-user-a",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const second = await createReservationInMysql({
      userId: "slot-route-user-b",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
        capacity: 1,
      }),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(slot.capacity).toBe(4);
    expect(slot.reservedCount).toBe(2);
  });
});
