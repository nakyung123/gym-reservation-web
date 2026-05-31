import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/reservation-slots/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

type SlotPolicyBody = {
  gymId: string;
  sport: "배드민턴";
  date: string;
  time: string;
  capacity?: number;
  isClosed?: boolean;
};

function rawRequestFor(body: unknown, bearer = ADMIN_BEARER): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      authorization: bearer,
    },
    body: JSON.stringify(body),
  });
}

function requestFor(body: SlotPolicyBody, bearer = ADMIN_BEARER): NextRequest {
  return rawRequestFor(body, bearer);
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

async function createTwoReservationsForSlot(date: string, userPrefix: string) {
  const draft = {
    gymId: TEST_GYM.id,
    sport: "배드민턴" as const,
    date,
    time: "10:00",
  };
  const first = await createReservationInDb({
    userId: `${userPrefix}-user-a`,
    draft,
    gym: TEST_GYM,
  });
  const second = await createReservationInDb({
    userId: `${userPrefix}-user-b`,
    draft,
    gym: TEST_GYM,
  });

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
}

describe("PATCH /api/admin/reservation-slots", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증이 있으면 단일 슬롯 정책을 변경한다", async () => {
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

  it("Authorization 헤더가 없으면 변경하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

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
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("admin claim이 없으면 403을 반환하고 변경하지 않는다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

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

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/admin/reservation-slots", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: ADMIN_BEARER,
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
    await createTwoReservationsForSlot(date, "slot-route-capacity-conflict");

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

  it("예약이 있는 슬롯을 마감해도 기존 예약 수는 유지한다", async () => {
    const date = futureDate();
    await createTwoReservationsForSlot(date, "slot-route-close");

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: "10:00",
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slot?: { reservedCount?: unknown; status?: unknown; isClosed?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.slot).toMatchObject({
      reservedCount: 2,
      isClosed: true,
      status: "closed",
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
    expect(slot.reservedCount).toBe(2);
    expect(slot.isClosed).toBe(true);
    expect(slot.capacity).toBe(4);
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
