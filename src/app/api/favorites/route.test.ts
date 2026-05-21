import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/favorites/route";
import { updateAdminGym } from "@/lib/server/db-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(idToken = "test-id-token") {
  return new NextRequest("http://localhost:3000/api/favorites", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("GET /api/favorites", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("로그인한 사용자의 즐겨찾기 체육관 ID만 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-list-user-a" });
    await prisma.favorite.createMany({
      data: [
        { userId: "favorite-list-user-a", gymId: TEST_GYM.id },
        { userId: "favorite-list-user-b", gymId: TEST_GYM.id },
      ],
    });

    const response = await GET(requestFor());
    const body = (await response.json()) as { gymIds?: unknown };

    expect(response.status).toBe(200);
    expect(body.gymIds).toEqual([TEST_GYM.id]);
  });

  it("비활성 체육관 즐겨찾기는 공개 목록에서 제외한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-list-inactive-user" });
    await prisma.favorite.create({
      data: {
        userId: "favorite-list-inactive-user",
        gymId: TEST_GYM.id,
      },
    });
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await GET(requestFor());
    const body = (await response.json()) as { gymIds?: unknown };

    expect(response.status).toBe(200);
    expect(body.gymIds).toEqual([]);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/favorites"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.any(String));
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
  });

  it("즐겨찾기 목록 조회 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-list-error-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.favorite, "findMany").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(requestFor());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("즐겨찾기 목록을 불러오지 못했습니다.");
  });
});
