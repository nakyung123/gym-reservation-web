import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/admin/overview/route";
import {
  cancelReservationAsAdminInMysql,
  createReservationInMysql,
  markReservationUsedInMysql,
  updateReservationSlotPolicy,
} from "@/lib/server/mysql-reservation-repository";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

function requestFor(params: Record<string, string> = {}, token = adminToken) {
  const url = new URL("http://localhost:3000/api/admin/overview");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return new NextRequest(url, {
    headers: { "x-admin-token": token },
  });
}

async function createReservation({
  userId,
  date,
  time,
}: {
  userId: string;
  date: string;
  time: string;
}) {
  const created = await createReservationInMysql({
    userId,
    draft: {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date,
      time,
    },
    gym: TEST_GYM,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.message);
  return created.reservation;
}

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰과 날짜가 있으면 예약, 매출, 슬롯 요약을 반환한다", async () => {
    const date = futureDate();
    const reserved = await createReservation({
      userId: "overview-user-a",
      date,
      time: "10:00",
    });
    const used = await createReservation({
      userId: "overview-user-b",
      date,
      time: "11:00",
    });
    const cancelled = await createReservation({
      userId: "overview-user-c",
      date,
      time: "12:00",
    });
    await markReservationUsedInMysql(used.id);
    await cancelReservationAsAdminInMysql(cancelled.id);
    await updateReservationSlotPolicy({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date,
      time: "14:00",
      isClosed: true,
    });

    const response = await GET(requestFor({ date }));
    const body = (await response.json()) as {
      overview?: {
        date?: unknown;
        reservations?: Record<string, unknown>;
        revenue?: Record<string, unknown>;
        slots?: Record<string, unknown>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.overview).toMatchObject({
      date,
      reservations: {
        total: 3,
        reserved: 1,
        used: 1,
        cancelled: 1,
      },
      revenue: {
        expected: reserved.price + used.price,
        used: used.price,
      },
      slots: {
        total: 4,
        available: 3,
        full: 0,
        closed: 1,
        reservedCount: 2,
        capacity: 16,
      },
    });
  });

  it("관리자 토큰이 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/admin/overview?date=${futureDate()}`,
      ),
    );

    expect(response.status).toBe(401);
  });

  it("관리자 토큰이 틀리면 403을 반환한다", async () => {
    const response = await GET(requestFor({ date: futureDate() }, "wrong-token"));

    expect(response.status).toBe(403);
  });

  it("date가 없으면 400을 반환한다", async () => {
    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("date는 YYYY-MM-DD 형식이어야 합니다.");
  });

  it("date 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(requestFor({ date: "2026/05/13" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("date는 YYYY-MM-DD 형식이어야 합니다.");
  });

  it("존재하지 않는 날짜면 400을 반환한다", async () => {
    const response = await GET(requestFor({ date: "2026-02-30" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("date는 YYYY-MM-DD 형식이어야 합니다.");
  });
});
