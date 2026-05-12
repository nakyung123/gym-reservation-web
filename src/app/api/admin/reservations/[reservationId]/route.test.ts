import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH } from "@/app/api/admin/reservations/[reservationId]/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

function requestFor(reservationId: string, token = adminToken): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      headers: { "x-admin-token": token },
    },
  );
}

function patchRequestFor(
  reservationId: string,
  status: unknown,
  token = adminToken,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/reservations/${encodeURIComponent(reservationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ status }),
    },
  );
}

function contextFor(reservationId: string) {
  return { params: Promise.resolve({ reservationId }) };
}

describe("GET /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 예약 단건을 조회한다", async () => {
    const created = await createReservationInMysql({
      userId: "admin-detail-user",
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
      userId: "admin-detail-user",
    });
  });

  it("관리자 토큰이 없으면 조회하지 않는다", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/admin/reservations/missing-reservation",
      ),
      contextFor("missing-reservation"),
    );

    expect(response.status).toBe(401);
  });

  it("존재하지 않는 예약 ID는 404를 반환한다", async () => {
    const response = await GET(
      requestFor("missing-reservation"),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("예약을 찾을 수 없습니다.");
  });
});

describe("PATCH /api/admin/reservations/[reservationId]", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  it("관리자 토큰이 있으면 예약을 이용 완료 처리한다", async () => {
    const created = await createReservationInMysql({
      userId: "admin-patch-user",
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

    const response = await PATCH(
      patchRequestFor(created.reservation.id, "used"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("used");
    expect(body.reservation?.status).toBe("used");

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("used");
    await expect(
      prisma.reservationLock.findUnique({
        where: { activeKey: row.activeKey },
      }),
    ).resolves.toBeNull();
  });

  it("지원하지 않는 상태 변경 요청은 400을 반환한다", async () => {
    const response = await PATCH(
      patchRequestFor("reservation-a", "reserved"),
      contextFor("reservation-a"),
    );

    expect(response.status).toBe(400);
  });

  it("관리자 토큰이 없으면 예약 상태를 변경하지 않는다", async () => {
    const created = await createReservationInMysql({
      userId: "admin-patch-auth-user",
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

    const response = await PATCH(
      new NextRequest(
        `http://localhost:3000/api/admin/reservations/${created.reservation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        },
      ),
      contextFor(created.reservation.id),
    );

    expect(response.status).toBe(401);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
  });
});
