import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/reservations/route";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function authHeaders(idToken = "test-id-token") {
  return { Authorization: `Bearer ${idToken}` };
}

function getRequest(idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/reservations", {
    headers: authHeaders(idToken),
  });
}

function postRequest(body: unknown, idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: {
      ...authHeaders(idToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/reservations", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("로그인한 사용자의 예약만 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "route-user-a" });
    const date = futureDate();
    const own = await createReservationInMysql({
      userId: "route-user-a",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    const other = await createReservationInMysql({
      userId: "route-user-b",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(own.ok).toBe(true);
    expect(other.ok).toBe(true);
    if (!own.ok || !other.ok) return;

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      reservations?: Array<{ id?: unknown; userId?: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(body.reservations).toEqual([
      expect.objectContaining({
        id: own.reservation.id,
        userId: "route-user-a",
      }),
    ]);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/reservations"),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(getRequest());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
  });

  it("예약 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "list-error-route-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(getRequest());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 목록을 불러오지 못했습니다.");
  });
});

describe("POST /api/reservations", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("올바른 요청이면 예약을 생성하고 슬롯 카운터를 증가시킨다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "create-route-user" });
    const date = futureDate();

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      reservation?: { userId?: unknown; gymId?: unknown; price?: unknown };
    };

    expect(response.status).toBe(201);
    expect(body.status).toBe("created");
    expect(body.reservation).toMatchObject({
      userId: "create-route-user",
      gymId: TEST_GYM.id,
      price: 12000,
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
    expect(slot.reservedCount).toBe(1);
  });

  it("같은 사용자의 같은 활성 예약은 409 duplicate로 응답하고 슬롯을 다시 늘리지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "duplicate-route-user" });
    const date = futureDate();
    const body = {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date,
      time: "10:00",
    };

    const firstResponse = await POST(postRequest(body));
    const secondResponse = await POST(postRequest(body));
    const secondBody = (await secondResponse.json()) as {
      status?: unknown;
      reservation?: { userId?: unknown };
    };

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(409);
    expect(secondBody.status).toBe("duplicate");
    expect(secondBody.reservation).toMatchObject({
      userId: "duplicate-route-user",
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
    expect(slot.reservedCount).toBe(1);
  });

  it("정원이 가득 찬 슬롯이면 409 full로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "full-route-user-e" });
    const date = futureDate();
    const draft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };

    for (const userId of [
      "full-route-user-a",
      "full-route-user-b",
      "full-route-user-c",
      "full-route-user-d",
    ]) {
      const created = await createReservationInMysql({
        userId,
        draft,
        gym: TEST_GYM,
      });
      expect(created.ok).toBe(true);
    }

    const response = await POST(postRequest(draft));
    const body = (await response.json()) as {
      status?: unknown;
      slot?: { status?: unknown; remaining?: unknown };
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("full");
    expect(body.slot).toMatchObject({
      status: "full",
      remaining: 0,
    });
  });

  it("본문 형식이 올바르지 않으면 400을 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "invalid-body-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "축구",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 올바르지 않습니다.");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("malformed JSON returns 400 and does not create a reservation", async () => {
    verifyIdToken.mockResolvedValue({ uid: "malformed-json-route-user" });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: "{invalid-json",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("체육관이 없으면 404를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "missing-gym-route-user" });

    const response = await POST(
      postRequest({
        gymId: "missing-gym",
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("비활성 체육관이면 404를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "inactive-gym-route-user" });
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("존재하지 않는 날짜면 422를 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "invalid-date-route-user" });

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: "2026-02-30",
        time: "10:00",
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "예약 날짜 또는 시간 형식이 올바르지 않습니다.",
    );
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 예약을 만들지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 본문을 처리하지 않는다", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: futureDate(),
          time: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("예약 생성 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "create-error-route-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservation, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await POST(
      postRequest({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("예약 요청을 처리하지 못했습니다.");
  });
});
