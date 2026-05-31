import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/overview/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import {
  cancelReservationAsAdminInDb,
  createReservationInDb,
  markReservationUsedInDb,
  updateReservationSlotPolicy,
} from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function requestFor(params: Record<string, string> = {}, bearer = ADMIN_BEARER) {
  const url = new URL("http://localhost:3000/api/admin/overview");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return new NextRequest(url, {
    headers: { authorization: bearer },
  });
}

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

function setAdminAuthError(status: 401 | 403, message: string) {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
    ok: false,
    status,
    message,
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
  const created = await createReservationInDb({
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
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증과 날짜가 있으면 예약, 매출, 슬롯 요약을 반환한다", async () => {
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
    await markReservationUsedInDb(used.id);
    await cancelReservationAsAdminInDb(cancelled.id);
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

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/admin/overview?date=${futureDate()}`,
      ),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await GET(requestFor({ date: futureDate() }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
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

  it("관리자 운영 요약 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "groupBy").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(requestFor({ date: futureDate() }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("관리자 운영 요약을 불러오지 못했습니다.");
  });
});
