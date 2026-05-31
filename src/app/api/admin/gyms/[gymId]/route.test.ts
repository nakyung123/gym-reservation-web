import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/gyms/[gymId]/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import {
  cancelReservationAsAdminInDb,
  createReservationInDb,
  markReservationUsedInDb,
} from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import type { AdminGym } from "@/types/domain";
import { TEST_GYM, futureDate } from "@tests/setup-db";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

const ADMIN_BEARER = "Bearer admin-test-id-token";

const updateBody: Omit<AdminGym, "id"> = {
  ...TEST_GYM,
  name: "수정된 테스트 체육관",
  basePrice: 13000,
  isActive: true,
};

function contextFor(gymId: string) {
  return { params: Promise.resolve({ gymId }) };
}

function patchRequest(body: unknown, bearer = ADMIN_BEARER) {
  return new NextRequest(
    `http://localhost:3000/api/admin/gyms/${TEST_GYM.id}`,
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

describe("PATCH /api/admin/gyms/[gymId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자 인증과 올바른 본문이 있으면 시설 정보를 수정한다", async () => {
    const response = await PATCH(patchRequest(updateBody), contextFor(TEST_GYM.id));
    const body = (await response.json()) as {
      gym?: { id?: unknown; name?: unknown; basePrice?: unknown };
      message?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.message).toBe("시설 정보가 저장되었습니다.");
    expect(body.gym).toMatchObject({
      id: TEST_GYM.id,
      name: "수정된 테스트 체육관",
      basePrice: 13000,
    });

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.name).toBe("수정된 테스트 체육관");
    expect(row.basePrice).toBe(13000);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 수정하지 않는다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");

    const response = await PATCH(
      new NextRequest(`http://localhost:3000/api/admin/gyms/${TEST_GYM.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("관리자 인증이 필요합니다.");

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.name).toBe(TEST_GYM.name);
  });

  it("admin claim이 없으면 403을 반환하고 수정하지 않는다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");

    const response = await PATCH(
      patchRequest(updateBody),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(403);
    expect(body.message).toBe("관리자 권한이 없습니다.");

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.name).toBe(TEST_GYM.name);
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환한다", async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost:3000/api/admin/gyms/${TEST_GYM.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: ADMIN_BEARER,
        },
        body: "{",
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.name).toBe(TEST_GYM.name);
  });

  it("본문 검증에 실패하면 400을 반환하고 수정하지 않는다", async () => {
    const response = await PATCH(
      patchRequest({
        ...updateBody,
        officialUrl: "ftp://example.com",
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("공식 URL은 http 또는 https 주소여야 합니다.");

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.name).toBe(TEST_GYM.name);
  });

  it("수정할 시설이 없으면 404를 반환한다", async () => {
    const response = await PATCH(
      patchRequest(updateBody),
      contextFor("missing-gym"),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(404);
    expect(body.status).toBe("not-found");
    expect(body.message).toBe("수정할 시설을 찾을 수 없습니다.");
  });

  it("예약 완료 상태의 예약이 남아 있으면 비활성화를 거부한다", async () => {
    const created = await createReservationInDb({
      userId: "admin-gym-route-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await PATCH(
      patchRequest({
        ...updateBody,
        isActive: false,
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as {
      status?: unknown;
      message?: unknown;
    };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");
    expect(body.message).toBe(
      "예약 완료 상태의 예약이 남아 있어 시설을 비활성화할 수 없습니다.",
    );

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.isActive).toBe(true);
  });

  it("예약 완료 상태의 예약 종목 제거를 409로 거부한다", async () => {
    const reservedSport = TEST_GYM.sports[0];
    const created = await createReservationInDb({
      userId: "admin-gym-route-sport-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: reservedSport,
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await PATCH(
      patchRequest({
        ...updateBody,
        sports: TEST_GYM.sports.filter((sport) => sport !== reservedSport),
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");

    const sports = await prisma.gymSport.findMany({
      where: { gymId: TEST_GYM.id },
      select: { sport: true },
    });
    expect(sports.map((row) => row.sport)).toContain(reservedSport);
  });

  it("예약 완료 상태의 예약 시간 제거를 409로 거부한다", async () => {
    const reservedTime = "10:00";
    const created = await createReservationInDb({
      userId: "admin-gym-route-time-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: reservedTime,
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await PATCH(
      patchRequest({
        ...updateBody,
        availableTimes: TEST_GYM.availableTimes.filter(
          (time) => time !== reservedTime,
        ),
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("conflict");

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.availableTimes).toContain(reservedTime);
  });

  it("취소된 예약 이력은 시설 비활성화를 막지 않는다", async () => {
    const created = await createReservationInDb({
      userId: "admin-gym-route-cancelled-history-user",
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
    await expect(
      cancelReservationAsAdminInDb(created.reservation.id),
    ).resolves.toMatchObject({ ok: true });

    const response = await PATCH(
      patchRequest({
        ...updateBody,
        isActive: false,
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as {
      gym?: { isActive?: unknown };
      message?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.message).toBe("시설 정보가 저장되었습니다.");
    expect(body.gym?.isActive).toBe(false);

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.isActive).toBe(false);
  });

  it("이용 완료된 예약 이력은 과거 종목과 시간 제거를 막지 않는다", async () => {
    const usedSport = TEST_GYM.sports[0];
    const usedTime = "10:00";
    const remainingSports = TEST_GYM.sports.filter(
      (sport) => sport !== usedSport,
    );
    expect(remainingSports.length).toBeGreaterThan(0);

    const created = await createReservationInDb({
      userId: "admin-gym-route-used-history-user",
      draft: {
        gymId: TEST_GYM.id,
        sport: usedSport,
        date: futureDate(),
        time: usedTime,
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      markReservationUsedInDb(created.reservation.id),
    ).resolves.toMatchObject({ ok: true });

    const response = await PATCH(
      patchRequest({
        ...updateBody,
        sports: remainingSports,
        sportPrices: Object.fromEntries(
          Object.entries(TEST_GYM.sportPrices).filter(
            ([sport]) => sport !== usedSport,
          ),
        ),
        availableTimes: TEST_GYM.availableTimes.filter(
          (time) => time !== usedTime,
        ),
      }),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as {
      gym?: { sports?: unknown; availableTimes?: unknown };
      message?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.message).toBe("시설 정보가 저장되었습니다.");
    expect(body.gym?.sports).not.toContain(usedSport);
    expect(body.gym?.availableTimes).not.toContain(usedTime);

    const row = await prisma.gym.findUniqueOrThrow({
      where: { id: TEST_GYM.id },
    });
    expect(row.availableTimes).not.toContain(usedTime);

    const sports = await prisma.gymSport.findMany({
      where: { gymId: TEST_GYM.id },
      select: { sport: true },
    });
    expect(sports.map((sportRow) => sportRow.sport)).not.toContain(usedSport);
  });

  it("시설 수정 중 서버 오류가 발생하면 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PATCH(patchRequest(updateBody), contextFor(TEST_GYM.id));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("시설 정보를 저장하지 못했습니다.");
  });
});
