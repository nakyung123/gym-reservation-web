import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/revenue/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import {
  createReservationInDb,
  markReservationUsedInDb,
} from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function requestFor(
  params: Record<string, string> = {},
  bearer = ADMIN_BEARER,
) {
  const url = new URL("http://localhost:3000/api/admin/revenue");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url, { headers: { authorization: bearer } });
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

async function createUsedReservation({
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
    draft: { gymId: TEST_GYM.id, sport: "배드민턴", date, time },
    gym: TEST_GYM,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.message);
  await markReservationUsedInDb(created.reservation.id);
  return created.reservation;
}

describe("GET /api/admin/revenue", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증과 from·to가 있으면 기간 매출 요약을 반환한다", async () => {
    const date = futureDate();
    const used = await createUsedReservation({
      userId: "rev-route-a",
      date,
      time: "10:00",
    });

    const response = await GET(requestFor({ from: date, to: date }));
    const body = (await response.json()) as {
      summary?: {
        from?: unknown;
        to?: unknown;
        counts?: Record<string, unknown>;
        revenue?: Record<string, unknown>;
        gyms?: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      from: date,
      to: date,
      counts: { total: 1, reserved: 0, used: 1, cancelled: 0 },
      revenue: { expected: used.price, used: used.price },
    });
    expect(body.summary?.gyms).toHaveLength(1);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const date = futureDate();
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/admin/revenue?from=${date}&to=${date}`,
      ),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const date = futureDate();
    const response = await GET(requestFor({ from: date, to: date }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
  });

  it("from 또는 to가 없으면 400을 반환한다", async () => {
    const response = await GET(requestFor({ from: futureDate() }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("from·to는 YYYY-MM-DD 형식이어야 합니다.");
  });

  it("날짜 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({ from: "2026/05/01", to: "2026/05/31" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("from·to는 YYYY-MM-DD 형식이어야 합니다.");
  });

  it("from이 to보다 이후면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({ from: "2026-05-31", to: "2026-05-01" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("from은 to보다 이후일 수 없습니다.");
  });

  it("매출 요약 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "groupBy").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const date = futureDate();
    const response = await GET(requestFor({ from: date, to: date }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("매출/정산 요약을 불러오지 못했습니다.");
  });
});
