import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/reservation-slots/route";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";
import { updateReservationSlotPolicy } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

function requestFor(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/reservation-slots");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return new NextRequest(url);
}

describe("GET /api/reservation-slots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("체육관, 종목, 날짜가 올바르면 예약 가능 슬롯을 조회한다", async () => {
    const date = futureDate();
    await updateReservationSlotPolicy({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date,
      time: "10:00",
      capacity: 8,
      isClosed: true,
    });

    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date,
      }),
    );
    const body = (await response.json()) as {
      slots?: Array<{
        time?: unknown;
        capacity?: unknown;
        remaining?: unknown;
        status?: unknown;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.slots).toHaveLength(TEST_GYM.availableTimes.length);
    expect(body.slots?.[0]).toMatchObject({
      time: "10:00",
      capacity: 8,
      remaining: 0,
      status: "closed",
    });
    expect(body.slots?.[1]).toMatchObject({
      time: "11:00",
      capacity: 4,
      remaining: 4,
      status: "available",
    });
  });

  it("조회 조건이 부족하거나 형식이 틀리면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: "2026/05/13",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("슬롯 조회 조건이 올바르지 않습니다.");
  });

  it("존재하지 않는 날짜면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: "2026-02-30",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("슬롯 조회 조건이 올바르지 않습니다.");
  });

  it("존재하지 않는 체육관이면 404를 반환한다", async () => {
    const response = await GET(
      requestFor({
        gymId: "missing-gym",
        sport: "배드민턴",
        date: futureDate(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
  });

  it("비활성 체육관은 공개 슬롯 조회에서 404를 반환한다", async () => {
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("체육관 정보를 찾을 수 없습니다.");
  });

  it("체육관에서 지원하지 않는 종목이면 400을 반환한다", async () => {
    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배구",
        date: futureDate(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
    );
  });

  it("체육관 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.gym, "findFirst").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("체육관 정보를 불러오지 못했습니다.");
  });

  it("슬롯 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.reservationSlot, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(
      requestFor({
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("슬롯 정보를 불러오지 못했습니다.");
  });
});
