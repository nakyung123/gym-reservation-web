import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/app/api/reservations/[reservationId]/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(
  reservationId: string,
  idToken = "test-id-token",
  method = "GET",
) {
  return new NextRequest(
    `http://localhost:3000/api/reservations/${encodeURIComponent(reservationId)}`,
    {
      method,
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
      gym?: { id?: unknown; name?: unknown };
      detail?: {
        cancellation?: { canCancel?: unknown; deadline?: unknown };
        admission?: { active?: unknown; entryCode?: unknown };
      };
    };

    expect(response.status).toBe(200);
    expect(body.reservation).toMatchObject({
      id: created.reservation.id,
      userId: "detail-user-a",
    });
    expect(body.detail).toMatchObject({
      cancellation: {
        canCancel: true,
      },
      admission: {
        active: true,
        entryCode: created.reservation.id.slice(0, 10).toUpperCase(),
      },
    });
    expect(body.gym).toMatchObject({
      id: TEST_GYM.id,
      name: TEST_GYM.name,
    });
    expect(typeof body.detail?.cancellation?.deadline).toBe("string");
  });

  it("비활성 시설의 지난 예약도 체육관 정보를 함께 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inactive-gym-detail-user" });
    const created = await createReservationInMysql({
      userId: "inactive-gym-detail-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await prisma.reservation.update({
      where: { id: created.reservation.id },
      data: { status: "cancelled" },
    });
    await prisma.gym.update({
      where: { id: TEST_GYM.id },
      data: { isActive: false },
    });

    const response = await GET(
      requestFor(created.reservation.id),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      reservation?: { id?: unknown; status?: unknown };
      gym?: { id?: unknown; name?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.reservation).toMatchObject({
      id: created.reservation.id,
      status: "cancelled",
    });
    expect(body.gym).toMatchObject({
      id: TEST_GYM.id,
      name: TEST_GYM.name,
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

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(
      requestFor("reservation-a"),
      contextFor("reservation-a"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
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

describe("DELETE /api/reservations/[reservationId]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("본인 예약을 취소하고 같은 요청을 반복하면 unchanged로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "cancel-route-user-a" });
    const date = futureDate();
    const created = await createReservationInMysql({
      userId: "cancel-route-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const firstResponse = await DELETE(
      requestFor(created.reservation.id, "test-id-token", "DELETE"),
      contextFor(created.reservation.id),
    );
    const firstBody = (await firstResponse.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
      detail?: {
        cancellation?: { canCancel?: unknown; reason?: unknown };
        admission?: { active?: unknown; entryCode?: unknown };
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(firstBody.status).toBe("cancelled");
    expect(firstBody.reservation).toMatchObject({ status: "cancelled" });
    expect(firstBody.detail).toMatchObject({
      cancellation: {
        canCancel: false,
        reason: "not-reserved",
      },
      admission: {
        active: false,
        entryCode: null,
      },
    });

    const secondResponse = await DELETE(
      requestFor(created.reservation.id, "test-id-token", "DELETE"),
      contextFor(created.reservation.id),
    );
    const secondBody = (await secondResponse.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
      detail?: {
        cancellation?: { canCancel?: unknown; reason?: unknown };
      };
    };

    expect(secondResponse.status).toBe(200);
    expect(secondBody.status).toBe("unchanged");
    expect(secondBody.reservation).toMatchObject({ status: "cancelled" });
    expect(secondBody.detail).toMatchObject({
      cancellation: {
        canCancel: false,
        reason: "not-reserved",
      },
    });

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
    expect(slot.reservedCount).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("다른 사용자의 예약은 403으로 응답하고 변경하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "cancel-route-user-b" });
    const created = await createReservationInMysql({
      userId: "cancel-route-user-a",
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

    const response = await DELETE(
      requestFor(created.reservation.id, "test-id-token", "DELETE"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("다른 사용자의 예약은 취소할 수 없습니다.");

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");
  });

  it("이미 이용 완료된 예약은 409로 응답하고 변경하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "used-cancel-route-user" });
    const created = await createReservationInMysql({
      userId: "used-cancel-route-user",
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

    await prisma.reservation.update({
      where: { id: created.reservation.id },
      data: { status: "used" },
    });

    const response = await DELETE(
      requestFor(created.reservation.id, "test-id-token", "DELETE"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { status?: unknown };
      detail?: { cancellation?: { reason?: unknown } };
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("not-cancellable");
    expect(body.reservation).toMatchObject({ status: "used" });
    expect(body.detail).toMatchObject({
      cancellation: { reason: "not-reserved" },
    });
  });

  it("예약이 없으면 404를 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "missing-cancel-route-user" });

    const response = await DELETE(
      requestFor("missing-reservation", "test-id-token", "DELETE"),
      contextFor("missing-reservation"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("취소할 예약을 찾을 수 없습니다.");
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 예약을 취소하지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));
    const date = futureDate();
    const created = await createReservationInMysql({
      userId: "cancel-auth-failed-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const response = await DELETE(
      requestFor(created.reservation.id, "test-id-token", "DELETE"),
      contextFor(created.reservation.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: created.reservation.id },
    });
    expect(row.status).toBe("reserved");

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
    expect(slot.reservedCount).toBe(1);
    expect(await prisma.reservationLock.count()).toBe(1);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/reservations/reservation-a", {
        method: "DELETE",
      }),
      contextFor("reservation-a"),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
