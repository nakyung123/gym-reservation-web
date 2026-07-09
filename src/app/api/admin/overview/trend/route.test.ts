import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/overview/trend/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

function requestFor(params: Record<string, string> = {}, bearer = ADMIN_BEARER) {
  const url = new URL("http://localhost:3000/api/admin/overview/trend");
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

describe("GET /api/admin/overview/trend", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("범위 내 일별 예약 추이를 반환하고 예약 없는 날짜는 0으로 채운다", async () => {
    const date = futureDate();
    const prevDate = new Date(`${date}T00:00:00Z`);
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const from = prevDate.toISOString().slice(0, 10);

    const created = await createReservationInDb({
      userId: "trend-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await GET(requestFor({ from, to: date }));
    const body = (await response.json()) as { trend?: unknown };

    expect(response.status).toBe(200);
    expect(body.trend).toEqual([
      { date: from, reserved: 0, cancelled: 0, used: 0 },
      { date, reserved: 1, cancelled: 0, used: 0 },
    ]);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/admin/overview/trend?from=2026-07-01&to=2026-07-07",
      ),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await GET(
      requestFor({ from: "2026-07-01", to: "2026-07-07" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
  });

  it("from 또는 to가 없거나 형식이 올바르지 않으면 400을 반환한다", async () => {
    const missing = await GET(requestFor({ from: "2026-07-01" }));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { message?: unknown }).message).toBe(
      "from·to는 YYYY-MM-DD 형식이어야 합니다.",
    );

    const malformed = await GET(
      requestFor({ from: "2026/07/01", to: "2026-07-07" }),
    );
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { message?: unknown }).message).toBe(
      "from·to는 YYYY-MM-DD 형식이어야 합니다.",
    );
  });

  it("from이 to보다 이후면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({ from: "2026-07-08", to: "2026-07-01" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("from은 to보다 이후일 수 없습니다.");
  });

  it("범위가 최대 일수를 넘으면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({ from: "2026-01-01", to: "2026-03-31" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("조회 범위는 최대 62일입니다.");
  });

  it("예약 추이 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "groupBy").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      requestFor({ from: "2026-07-01", to: "2026-07-07" }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 추이를 불러오지 못했습니다.");
  });
});
