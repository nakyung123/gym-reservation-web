import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/reservations/route";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function authHeaders(idToken = "test-id-token") {
  return { Authorization: `Bearer ${idToken}` };
}

describe("GET /api/reservations status filter", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("status 쿼리가 있으면 본인 예약 중 해당 상태만 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "route-filter-user" });
    const reserved = await createReservationInDb({
      userId: "route-filter-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    const cancelled = await createReservationInDb({
      userId: "route-filter-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(8),
        time: "11:00",
      },
      gym: TEST_GYM,
    });
    const otherUserCancelled = await createReservationInDb({
      userId: "route-filter-other-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(9),
        time: "12:00",
      },
      gym: TEST_GYM,
    });
    expect(reserved.ok).toBe(true);
    expect(cancelled.ok).toBe(true);
    expect(otherUserCancelled.ok).toBe(true);
    if (!reserved.ok || !cancelled.ok || !otherUserCancelled.ok) return;

    await prisma.reservation.updateMany({
      where: {
        id: {
          in: [cancelled.reservation.id, otherUserCancelled.reservation.id],
        },
      },
      data: { status: "cancelled" },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/reservations?status=cancelled",
        {
          headers: authHeaders(),
        },
      ),
    );
    const body = (await response.json()) as {
      reservations?: Array<{ id?: unknown; status?: unknown; userId?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.reservations).toEqual([
      expect.objectContaining({
        id: cancelled.reservation.id,
        status: "cancelled",
        userId: "route-filter-user",
      }),
    ]);
  });

  it("status 쿼리가 지원하지 않는 값이면 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "route-invalid-filter-user" });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/reservations?status=pending", {
        headers: authHeaders(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "status는 reserved, cancelled, used 중 하나여야 합니다.",
    );
  });
});
