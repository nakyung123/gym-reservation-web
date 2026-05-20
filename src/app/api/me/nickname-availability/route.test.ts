import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/me/nickname-availability/route";
import { prisma } from "@/lib/server/prisma-client";
import { NICKNAME_MAX_LENGTH } from "@/lib/user-profile";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(
  nickname: string,
  { idToken }: { idToken?: string } = {},
) {
  return new NextRequest(
    `http://localhost:3000/api/me/nickname-availability?nickname=${encodeURIComponent(
      nickname,
    )}`,
    {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    },
  );
}

describe("GET /api/me/nickname-availability", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("빈 닉네임은 invalid로 응답하고 DB를 조회하지 않는다", async () => {
    const findSpy = vi.spyOn(prisma.userProfile, "findUnique");

    const response = await GET(requestFor("   "));
    const body = (await response.json()) as {
      available?: unknown;
      reason?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: false, reason: "invalid" });
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it("길이 제한을 넘는 닉네임은 invalid로 응답한다", async () => {
    const response = await GET(requestFor("가".repeat(NICKNAME_MAX_LENGTH + 1)));
    const body = (await response.json()) as {
      available?: unknown;
      reason?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: false, reason: "invalid" });
  });

  it("저장된 닉네임이 없으면 사용 가능으로 응답한다", async () => {
    const response = await GET(requestFor("새닉네임"));
    const body = (await response.json()) as { available?: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: true });
  });

  it("다른 사용자가 가진 닉네임이면 taken으로 응답한다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "nickname-owner",
        nickname: "중복닉",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });

    const response = await GET(requestFor("  중복닉  "));
    const body = (await response.json()) as {
      available?: unknown;
      reason?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: false, reason: "taken" });
  });

  it("인증된 본인의 닉네임이면 사용 가능으로 응답한다", async () => {
    const userId = "nickname-self";
    await prisma.userProfile.create({
      data: {
        userId,
        nickname: "내닉네임",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });

    const response = await GET(requestFor("내닉네임", { idToken: "token" }));
    const body = (await response.json()) as { available?: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({ available: true });
  });

  it("인증 헤더가 있는데 토큰 검증에 실패하면 익명 요청으로 대체하지 않고 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));
    const findSpy = vi.spyOn(prisma.userProfile, "findUnique");

    const response = await GET(requestFor("내닉네임", { idToken: "bad-token" }));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it("DB 오류는 안전한 message를 담은 500으로 응답한다", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const findSpy = vi
      .spyOn(prisma.userProfile, "findUnique")
      .mockRejectedValueOnce(new Error("database offline"));

    try {
      const response = await GET(requestFor("새닉네임"));
      const body = (await response.json()) as { message?: unknown };

      expect(response.status).toBe(500);
      expect(body.message).toBe("닉네임 사용 가능 여부를 확인하지 못했습니다.");
    } finally {
      findSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
