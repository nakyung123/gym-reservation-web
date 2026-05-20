import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "@/app/api/favorites/[gymId]/route";
import { updateAdminGym } from "@/lib/server/db-gym-admin-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(gymId: string, method: "PUT" | "DELETE") {
  return new NextRequest(
    `http://localhost:3000/api/favorites/${encodeURIComponent(gymId)}`,
    {
      method,
      headers: { Authorization: "Bearer test-id-token" },
    },
  );
}

function contextFor(gymId: string) {
  return { params: Promise.resolve({ gymId }) };
}

describe("PUT /api/favorites/[gymId]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("즐겨찾기를 추가하고 같은 요청을 반복해도 한 건만 유지한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-put-user" });

    const firstResponse = await PUT(
      requestFor(TEST_GYM.id, "PUT"),
      contextFor(TEST_GYM.id),
    );
    const secondResponse = await PUT(
      requestFor(TEST_GYM.id, "PUT"),
      contextFor(TEST_GYM.id),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await prisma.favorite.count()).toBe(1);
  });

  it("없는 체육관이면 404를 반환하고 추가하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-missing-user" });

    const response = await PUT(
      requestFor("missing-gym", "PUT"),
      contextFor("missing-gym"),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("존재하지 않는 체육관입니다.");
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("비활성 체육관이면 404를 반환하고 추가하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-inactive-user" });
    const updated = await updateAdminGym(TEST_GYM.id, {
      ...TEST_GYM,
      isActive: false,
    });
    expect(updated.ok).toBe(true);

    const response = await PUT(
      requestFor(TEST_GYM.id, "PUT"),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(404);
    expect(body.message).toBe("존재하지 않는 체육관입니다.");
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 추가하지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await PUT(
      requestFor(TEST_GYM.id, "PUT"),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/favorites/${TEST_GYM.id}`, {
        method: "PUT",
      }),
      contextFor(TEST_GYM.id),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("즐겨찾기 추가 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-put-error-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.gym, "findFirst").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PUT(
      requestFor(TEST_GYM.id, "PUT"),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("즐겨찾기를 추가하지 못했습니다.");
  });
});

describe("DELETE /api/favorites/[gymId]", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("즐겨찾기를 삭제하고 같은 요청을 반복해도 성공으로 응답한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-delete-user" });
    await prisma.favorite.create({
      data: { userId: "favorite-delete-user", gymId: TEST_GYM.id },
    });

    const firstResponse = await DELETE(
      requestFor(TEST_GYM.id, "DELETE"),
      contextFor(TEST_GYM.id),
    );
    const secondResponse = await DELETE(
      requestFor(TEST_GYM.id, "DELETE"),
      contextFor(TEST_GYM.id),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("다른 사용자의 즐겨찾기는 삭제하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-delete-user-a" });
    await prisma.favorite.create({
      data: { userId: "favorite-delete-user-b", gymId: TEST_GYM.id },
    });

    const response = await DELETE(
      requestFor(TEST_GYM.id, "DELETE"),
      contextFor(TEST_GYM.id),
    );

    expect(response.status).toBe(200);
    expect(await prisma.favorite.count()).toBe(1);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 삭제하지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));
    await prisma.favorite.create({
      data: { userId: "favorite-delete-user", gymId: TEST_GYM.id },
    });

    const response = await DELETE(
      requestFor(TEST_GYM.id, "DELETE"),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(await prisma.favorite.count()).toBe(1);
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/favorites/${TEST_GYM.id}`, {
        method: "DELETE",
      }),
      contextFor(TEST_GYM.id),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("즐겨찾기 해제 중 서버 오류가 발생하면 500을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "favorite-delete-error-user" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.favorite, "delete").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await DELETE(
      requestFor(TEST_GYM.id, "DELETE"),
      contextFor(TEST_GYM.id),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("즐겨찾기를 해제하지 못했습니다.");
  });
});
