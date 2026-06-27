import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/me/login-id-availability/route";
import { prisma } from "@/lib/server/prisma-client";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(loginId: string, { idToken }: { idToken?: string } = {}) {
  return new NextRequest(
    `http://localhost:3000/api/me/login-id-availability?loginId=${encodeURIComponent(
      loginId,
    )}`,
    {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    },
  );
}

describe("GET /api/me/login-id-availability", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("형식이 잘못된 아이디는 invalid로 응답하고 DB를 조회하지 않는다", async () => {
    const findSpy = vi.spyOn(prisma.userProfile, "findUnique");

    // 대문자/짧은 길이 등 형식 위반.
    const response = await GET(requestFor("AB"));
    const body = (await response.json()) as {
      available?: unknown;
      reason?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: false, reason: "invalid" });
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it("저장된 아이디가 없으면 사용 가능으로 응답한다", async () => {
    const response = await GET(requestFor("freshid01"));
    const body = (await response.json()) as { available?: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: true });
  });

  it("다른 사용자가 가진 아이디면 taken으로 응답한다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "loginid-owner",
        loginId: "takenid01",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });

    const response = await GET(requestFor("  takenid01  "));
    const body = (await response.json()) as {
      available?: unknown;
      reason?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: false, reason: "taken" });
  });

  it("인증된 본인의 아이디면 사용 가능으로 응답한다", async () => {
    const userId = "loginid-self";
    await prisma.userProfile.create({
      data: {
        userId,
        loginId: "myownid01",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });

    const response = await GET(requestFor("myownid01", { idToken: "token" }));
    const body = (await response.json()) as { available?: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: true });
  });

  it("인증 헤더가 있는데 토큰 검증 실패면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));
    const findSpy = vi.spyOn(prisma.userProfile, "findUnique");

    const response = await GET(requestFor("someid01", { idToken: "bad" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });
});
