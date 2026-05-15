import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/me/route";
import { createReservationInMysql } from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/me", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("GET /api/me", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("로그인 사용자 uid와 내 정보 요약을 반환한다", async () => {
    const userId = "me-route-user";
    verifyIdToken.mockResolvedValue({ uid: userId });
    const created = await createReservationInMysql({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    await prisma.favorite.create({
      data: { userId, gymId: TEST_GYM.id },
    });

    const response = await GET(requestFor());
    const body = (await response.json()) as {
      user?: { uid?: unknown };
      summary?: {
        userId?: unknown;
        reservations?: {
          total?: unknown;
          reserved?: unknown;
          cancelled?: unknown;
          used?: unknown;
        };
        favorites?: { activeGymCount?: unknown };
      };
    };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({ uid: userId });
    expect(body.summary).toMatchObject({
      userId,
      reservations: {
        total: 1,
        reserved: 1,
        cancelled: 0,
        used: 0,
      },
      favorites: {
        activeGymCount: 1,
      },
    });
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/me"));

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
  });

  it("요약 조회 중 DB 오류가 발생하면 JSON 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "me-route-db-error-user" });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(prisma.reservation, "groupBy").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("내 정보 요약을 불러오지 못했습니다.");
    errorSpy.mockRestore();
  });
});
