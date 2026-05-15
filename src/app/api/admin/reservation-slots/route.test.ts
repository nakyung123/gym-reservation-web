import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/reservation-slots/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const adminToken = "test-admin-token";

type SlotPolicyBody = {
  gymId: string;
  sport: "배드민턴";
  date: string;
  time: string;
  capacity?: number;
  isClosed?: boolean;
};

function rawRequestFor(body: unknown, token = adminToken): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(body),
  });
}

function requestFor(body: SlotPolicyBody, token = adminToken): NextRequest {
  return rawRequestFor(body, token);
}

describe("PATCH /api/admin/reservation-slots", () => {
  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = adminToken;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 토큰이 있으면 단일 슬롯 정책을 변경한다", async () => {
    const date = futureDate();

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
        capacity: 8,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slot?: { capacity?: unknown; isClosed?: unknown; status?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.slot).toMatchObject({
      capacity: 8,
      isClosed: true,
      status: "closed",
    });

    const row = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(row.capacity).toBe(8);
    expect(row.isClosed).toBe(true);
  });

  it("관리자 토큰이 없으면 변경하지 않는다", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: futureDate(),
          time: "10:00",
          isClosed: true,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("관리자 토큰이 틀리면 403을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor(
        {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date: futureDate(),
          time: "10:00",
          isClosed: true,
        },
        "wrong-token",
      ),
    );

    expect(response.status).toBe(403);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("returns 503 and does not change a slot when the admin token is not configured", async () => {
    delete process.env.ADMIN_API_TOKEN;

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        isClosed: true,
      }),
    );

    expect(response.status).toBe(503);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: "{",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("변경할 정원 또는 마감 상태가 없으면 400을 반환한다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("변경할 정원 또는 마감 상태가 필요합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("isClosed가 boolean이 아니면 400을 반환한다", async () => {
    const response = await PATCH(
      rawRequestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        isClosed: "true",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("isClosed는 boolean이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("존재하지 않는 날짜면 400을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: "2026-02-30",
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("슬롯 변경 요청 본문이 올바르지 않습니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("정원 범위가 올바르지 않으면 400을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 1000,
      }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("체육관이 없으면 404를 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: "missing-gym",
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("체육관에서 지원하지 않는 종목이면 422를 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      rawRequestFor({
        gymId: TEST_GYM.id,
        sport: "배구",
        date: futureDate(),
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
    );
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("예약 가능 시간이 아니면 422를 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "09:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(body.message).toBe(
      "선택한 시간은 이 체육관의 예약 가능 시간이 아닙니다.",
    );
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("이미 예약된 인원보다 낮은 정원으로 줄이면 409를 반환한다", async () => {
    const date = futureDate();
    const reservedDraft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };
    const first = await createReservationInMysql({
      userId: "slot-route-user-a",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const second = await createReservationInMysql({
      userId: "slot-route-user-b",
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
        capacity: 1,
      }),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");

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
    expect(slot.capacity).toBe(4);
    expect(slot.reservedCount).toBe(2);
  });

  it("체육관 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.gym, "findFirst").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("체육관 정보를 불러오지 못했습니다.");
  });

  it("슬롯 정책 변경 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("슬롯 정책을 변경하지 못했습니다.");
  });
});
