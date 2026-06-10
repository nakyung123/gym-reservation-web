import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/reservation-slots/bulk/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import {
  createReservationInDb,
  RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT,
} from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

type BulkSlotPolicyBody = {
  gymId: string;
  sport: "배드민턴";
  dates: string[];
  times: string[];
  capacity?: number;
  isClosed?: boolean;
};

function rawRequestFor(body: unknown, bearer = ADMIN_BEARER): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/admin/reservation-slots/bulk",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: bearer,
      },
      body: JSON.stringify(body),
    },
  );
}

function requestFor(body: BulkSlotPolicyBody, bearer = ADMIN_BEARER): NextRequest {
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

describe("PATCH /api/admin/reservation-slots/bulk", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증이 있으면 여러 슬롯 정책을 한 번에 변경한다", async () => {
    const firstDate = futureDate();
    const secondDate = futureDate(8);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [firstDate, secondDate],
        times: ["10:00", "11:00"],
        capacity: 7,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slots?: unknown[];
      updatedCount?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.updatedCount).toBe(4);
    expect(body.slots).toHaveLength(4);

    const rows = await prisma.reservationSlot.findMany({
      where: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: { in: [firstDate, secondDate] },
        time: { in: ["10:00", "11:00"] },
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.capacity === 7)).toBe(true);
    expect(rows.every((row) => row.isClosed)).toBe(true);
  });

  it("슬롯 일괄 변경 시 audit 로그를 남긴다", async () => {
    const firstDate = futureDate();
    const secondDate = futureDate(8);

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [firstDate, secondDate],
        times: ["10:00", "11:00"],
        capacity: 7,
      }),
    );
    expect(response.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { targetType: "slot", targetId: `${TEST_GYM.id}:배드민턴` },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("slot.bulk_update");
    expect(rows[0]?.adminUid).toBe("admin-test-uid");
    expect(
      (rows[0]?.metadata as { updatedCount?: unknown } | null)?.updatedCount,
    ).toBe(4);
  });

  it("중복 날짜와 시간은 한 번만 변경한다", async () => {
    const date = futureDate();

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [date, date],
        times: ["10:00", "10:00"],
        capacity: 6,
      }),
    );
    const body = (await response.json()) as {
      slots?: unknown[];
      updatedCount?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.updatedCount).toBe(1);
    expect(body.slots).toHaveLength(1);
    expect(await prisma.reservationSlot.count()).toBe(1);
  });

  it("Authorization 헤더가 없으면 변경하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/admin/reservation-slots/bulk",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gymId: TEST_GYM.id,
            sport: "배드민턴",
            dates: [futureDate()],
            times: ["10:00"],
            isClosed: true,
          }),
        },
      ),
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
        dates: [futureDate()],
        times: ["10:00"],
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
      new NextRequest(
        "http://localhost:3000/api/admin/reservation-slots/bulk",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            authorization: ADMIN_BEARER,
          },
          body: "{",
        },
      ),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("요청 본문 구조가 올바르지 않으면 400을 반환한다", async () => {
    const response = await PATCH(
      rawRequestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("슬롯 일괄 변경 요청 본문이 올바르지 않습니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("날짜 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: ["2026/05/13"],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("dates는 YYYY-MM-DD 형식의 배열이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("존재하지 않는 날짜가 있으면 400을 반환한다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: ["2026-02-30"],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("dates는 YYYY-MM-DD 형식의 배열이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("isClosed가 boolean이 아니면 400을 반환한다", async () => {
    const response = await PATCH(
      rawRequestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [futureDate()],
        times: ["10:00"],
        isClosed: "true",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("isClosed는 boolean이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("변경할 정원 또는 마감 상태가 없으면 400을 반환한다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [futureDate()],
        times: ["10:00"],
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("변경할 정원 또는 마감 상태가 필요합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("체육관이 없으면 404를 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: "missing-gym",
        sport: "배드민턴",
        dates: [futureDate()],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("대상 슬롯 수가 제한을 넘으면 400을 반환한다", async () => {
    const dates = Array.from(
      { length: RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT + 1 },
      (_, index) => futureDate(index + 1),
    );

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates,
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      `한 번에 변경할 수 있는 슬롯은 최대 ${RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT}개입니다.`,
    );
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("예약 가능 시간이 아니면 422를 반환하고 변경하지 않는다", async () => {
    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [futureDate()],
        times: ["09:00"],
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
      "09:00은 이 체육관의 예약 가능 시간이 아닙니다.",
    );
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("충돌이 있으면 409와 conflicts를 반환하고 전체 변경을 거부한다", async () => {
    const date = futureDate();
    await createTwoReservationsForSlot(date, "bulk-slot-route-conflict");

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [date],
        times: ["10:00", "11:00"],
        capacity: 1,
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      status?: unknown;
      conflicts?: Array<{ time?: unknown; reservedCount?: unknown }>;
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts?.[0]).toMatchObject({
      time: "10:00",
      reservedCount: 2,
    });

    const untouchedSlot = await prisma.reservationSlot.findUnique({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "11:00",
        },
      },
    });
    expect(untouchedSlot).toBeNull();
  });

  it("예약이 있는 슬롯을 일괄 마감해도 기존 예약 수는 유지한다", async () => {
    const date = futureDate();
    await createTwoReservationsForSlot(date, "bulk-slot-route-close");

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [date],
        times: ["10:00", "11:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as {
      slots?: Array<{
        time?: unknown;
        reservedCount?: unknown;
        status?: unknown;
        isClosed?: unknown;
      }>;
      updatedCount?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.updatedCount).toBe(2);
    expect(body.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          time: "10:00",
          reservedCount: 2,
          isClosed: true,
          status: "closed",
        }),
        expect.objectContaining({
          time: "11:00",
          reservedCount: 0,
          isClosed: true,
          status: "closed",
        }),
      ]),
    );

    const rows = await prisma.reservationSlot.findMany({
      where: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
        time: { in: ["10:00", "11:00"] },
      },
      orderBy: { time: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      time: "10:00",
      reservedCount: 2,
      isClosed: true,
      capacity: 4,
    });
    expect(rows[1]).toMatchObject({
      time: "11:00",
      reservedCount: 0,
      isClosed: true,
      capacity: 4,
    });
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
        dates: [futureDate()],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("체육관 정보를 불러오지 못했습니다.");
  });

  it("슬롯 정책 일괄 변경 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PATCH(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        dates: [futureDate()],
        times: ["10:00"],
        isClosed: true,
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("슬롯 정책을 일괄 변경하지 못했습니다.");
  });
});
