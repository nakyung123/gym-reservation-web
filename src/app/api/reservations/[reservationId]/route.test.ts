import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/app/api/reservations/[reservationId]/route";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("로그인한 사용자는 본인 예약 단건을 조회한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "detail-user-a" });
    const created = await createReservationInDb({
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
    const created = await createReservationInDb({
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
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.any(String));
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
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
  });

  it("다른 사용자의 예약은 404로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "detail-user-b" });
    const created = await createReservationInDb({
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

  it("예약 상세 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "detail-error-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findFirst").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      requestFor("reservation-error"),
      contextFor("reservation-error"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 상세를 불러오지 못했습니다.");
  });
});

describe("DELETE /api/reservations/[reservationId]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("본인 예약을 취소하고 같은 요청을 반복하면 unchanged로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "cancel-route-user-a" });
    const date = futureDate();
    const created = await createReservationInDb({
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
    const created = await createReservationInDb({
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

    // 거부된 취소가 슬롯 카운터를 감소시키지 않는지 확인 (정합성 검증).
    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("이미 이용 완료된 예약은 409로 응답하고 변경하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "used-cancel-route-user" });
    const created = await createReservationInDb({
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

    // 거부된 취소가 슬롯 카운터를 감소시키지 않는지 확인 (정합성 검증).
    // 이용 완료 상태는 슬롯 카운터를 그대로 유지하므로 1이어야 한다.
    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("취소 마감 시간이 지난 예약은 409로 응답하고 슬롯을 변경하지 않는다", async () => {
    // 가짜 시간을 설정해 예약 생성 시점에는 충분히 미래, 취소 시점에는
    // 2시간 이내로 보이도록 만들어 cancel-deadline-passed 분기를 실제로 트리거한다.
    const fixedDate = "2026-12-01";
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 11, 1, 6, 0));
      verifyIdToken.mockResolvedValue({ uid: "deadline-cancel-route-user" });
      const created = await createReservationInDb({
        userId: "deadline-cancel-route-user",
        draft: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: fixedDate,
          time: "10:00",
        },
        gym: TEST_GYM,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // 예약 시작(10:00) 약 1시간 59분 전 → 2시간 컷오프 내라 취소 불가.
      vi.setSystemTime(new Date(2026, 11, 1, 8, 1));

      const response = await DELETE(
        requestFor(created.reservation.id, "test-id-token", "DELETE"),
        contextFor(created.reservation.id),
      );
      const body = (await response.json()) as {
        status?: unknown;
        reservation?: { status?: unknown };
        message?: unknown;
        detail?: { cancellation?: { canCancel?: unknown; reason?: unknown } };
      };

      expect(response.status).toBe(409);
      expect(body.status).toBe("not-cancellable");
      expect(body.message).toBe(
        "이용 시작 2시간 전까지만 취소할 수 있습니다.",
      );
      expect(body.reservation).toMatchObject({ status: "reserved" });
      expect(body.detail).toMatchObject({
        cancellation: { canCancel: false, reason: "cancel-deadline-passed" },
      });

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: created.reservation.id },
      });
      expect(row.status).toBe("reserved");

      const slot = await prisma.reservationSlot.findUniqueOrThrow({
        where: {
          gymId_sport_date_time: {
            gymId: TEST_GYM.id,
            sport: "배드민턴",
            date: fixedDate,
            time: "10:00",
          },
        },
      });
      expect(slot.reservedCount).toBe(1);
      expect(await prisma.reservationLock.count()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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
    const created = await createReservationInDb({
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
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");

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
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.any(String));
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("예약 취소 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "cancel-error-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findUnique").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await DELETE(
      requestFor("reservation-error", "test-id-token", "DELETE"),
      contextFor("reservation-error"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약을 취소하지 못했습니다.");
  });
});
