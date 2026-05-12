import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/reservations/[reservationId]/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(reservationId: string, idToken = "test-id-token") {
  return new NextRequest(
    `http://localhost:3000/api/reservations/${encodeURIComponent(reservationId)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );
}

function contextFor(reservationId: string) {
  return { params: Promise.resolve({ reservationId }) };
}

describe("GET /api/reservations/[reservationId]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("로그인한 사용자는 본인 예약 단건을 조회한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "detail-user-a" });
    const created = await createReservationInMysql({
      userId: "detail-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await GET(
      requestFor(created.reservation.id),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; userId?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.reservation).toMatchObject({
      id: created.reservation.id,
      userId: "detail-user-a",
    });
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/reservations/reservation-a"),
      contextFor("reservation-a"),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("다른 사용자의 예약은 404로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "detail-user-b" });
    const created = await createReservationInMysql({
      userId: "detail-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await GET(
      requestFor(created.reservation.id),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("예약을 찾을 수 없습니다.");
  });
});
