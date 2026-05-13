import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/favorites/route";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-mysql";

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

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
