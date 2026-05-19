import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/reservations/route";
import {
  cancelReservationAsAdminInMysql,
  createReservationInMysql,
  markReservationUsedInMysql,
} from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const adminToken = "test-admin-token";

function requestFor(params: Record<string, string> = {}, token = adminToken) {
  const url = new URL("http://localhost:3000/api/admin/reservations");
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

describe("GET /api/admin/reservations", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 토큰이 있으면 필터 조건에 맞는 예약 목록을 반환한다", async () => {
    const date = futureDate();
    const target = await createReservation({
      userId: "admin-list-user-a",
      date,
      time: "10:00",
    });
    const used = await createReservation({
      userId: "admin-list-user-b",
      date,
      time: "11:00",
    });
    const otherDate = await createReservation({
      userId: "admin-list-user-a",
      date: futureDate(8),
      time: "10:00",
    });
    await markReservationUsedInMysql(used.id);

    const response = await GET(
      requestFor({
        status: "reserved",
        gymId: TEST_GYM.id,
        date,
        userId: "admin-list-user-a",
        limit: "10",
      }),
    );
    const body = (await response.json()) as {
      reservations?: Array<{ id?: unknown; status?: unknown; userId?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.reservations).toEqual([
      expect.objectContaining({
        id: target.id,
        status: "reserved",
        userId: "admin-list-user-a",
      }),
    ]);
    expect(body.reservations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: used.id }),
        expect.objectContaining({ id: otherDate.id }),
      ]),
    );
  });

  it("limit이 있으면 응답 개수를 제한한다", async () => {
    const date = futureDate();
    await createReservation({
      userId: "admin-limit-user-a",
      date,
      time: "10:00",
    });
    await createReservation({
      userId: "admin-limit-user-b",
      date,
      time: "11:00",
    });

    const response = await GET(requestFor({ limit: "1" }));
    const body = (await response.json()) as { reservations?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.reservations).toHaveLength(1);
  });

  it("관리자 토큰이 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/admin/reservations"),
    );

    expect(response.status).toBe(401);
  });

  it("관리자 토큰이 틀리면 403을 반환한다", async () => {
    const response = await GET(requestFor({}, "wrong-token"));

    expect(response.status).toBe(403);
  });

  it("returns 503 when the admin token is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;

    const response = await GET(requestFor());

    expect(response.status).toBe(503);
  });

  it("status가 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(requestFor({ status: "pending" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "status는 reserved, cancelled, used 중 하나여야 합니다.",
    );
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

  it("limit이 정수 문자열이 아니면 400을 반환한다", async () => {
    const response = await GET(requestFor({ limit: "2abc" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("limit은 1 이상 200 이하의 정수여야 합니다.");
  });

  it("limit 범위를 벗어나면 400을 반환한다", async () => {
    const response = await GET(requestFor({ limit: "201" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("limit은 1 이상 200 이하의 정수여야 합니다.");
  });

  it("취소된 예약도 status 필터로 조회할 수 있다", async () => {
    const date = futureDate();
    const cancelled = await createReservation({
      userId: "admin-cancelled-list-user",
      date,
      time: "10:00",
    });
    await cancelReservationAsAdminInMysql(cancelled.id);

    const response = await GET(requestFor({ status: "cancelled" }));
    const body = (await response.json()) as {
      reservations?: Array<{ id?: unknown; status?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.reservations).toEqual([
      expect.objectContaining({
        id: cancelled.id,
        status: "cancelled",
      }),
    ]);
  });

  it("관리자 예약 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("관리자 예약 목록을 불러오지 못했습니다.");
  });
});
