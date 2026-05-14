import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/me/profile/route";
import { prisma } from "@/lib/server/prisma-client";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(method: "GET" | "PUT", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/me/profile", {
    method,
    headers: {
      Authorization: "Bearer test-id-token",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const profileInput = {
  nickname: "  나경  ",
  preferredRegion: "  서울 강서구  ",
  preferredSports: ["배드민턴", "탁구", "배드민턴"],
  reservationNotificationsEnabled: false,
};

describe("GET /api/me/profile", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("저장된 프로필이 없으면 profile null을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "profile-route-empty-user" });

    const response = await GET(requestFor("GET"));
    const body = (await response.json()) as {
      user?: { uid?: unknown };
      profile?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({ uid: "profile-route-empty-user" });
    expect(body.profile).toBeNull();
  });

  it("저장된 프로필을 반환한다", async () => {
    const userId = "profile-route-get-user";
    verifyIdToken.mockResolvedValue({ uid: userId });
    await prisma.userProfile.create({
      data: {
        userId,
        nickname: "나경",
        preferredRegion: "서울 강서구",
        preferredSports: ["배드민턴"],
        reservationNotificationsEnabled: true,
      },
    });

    const response = await GET(requestFor("GET"));
    const body = (await response.json()) as {
      profile?: { userId?: unknown; nickname?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({
      userId,
      nickname: "나경",
    });
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/me/profile"),
    );

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

describe("PUT /api/me/profile", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("프로필 설정을 생성하고 입력을 정리한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "profile-route-put-user" });

    const response = await PUT(requestFor("PUT", profileInput));
    const body = (await response.json()) as {
      message?: unknown;
      profile?: {
        userId?: unknown;
        nickname?: unknown;
        preferredRegion?: unknown;
        preferredSports?: unknown;
        reservationNotificationsEnabled?: unknown;
      };
    };

    expect(response.status).toBe(200);
    expect(body.message).toBe("프로필 설정이 저장되었습니다.");
    expect(body.profile).toMatchObject({
      userId: "profile-route-put-user",
      nickname: "나경",
      preferredRegion: "서울 강서구",
      preferredSports: ["배드민턴", "탁구"],
      reservationNotificationsEnabled: false,
    });
    expect(await prisma.userProfile.count()).toBe(1);
  });

  it("같은 사용자 요청을 반복해도 한 행만 유지한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "profile-route-idempotent-user" });

    const firstResponse = await PUT(requestFor("PUT", profileInput));
    const secondResponse = await PUT(
      requestFor("PUT", {
        ...profileInput,
        nickname: "나경2",
      }),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await prisma.userProfile.count()).toBe(1);
    await expect(
      prisma.userProfile.findUniqueOrThrow({
        where: { userId: "profile-route-idempotent-user" },
      }),
    ).resolves.toMatchObject({ nickname: "나경2" });
  });

  it("요청 본문이 JSON 형식이 아니면 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "profile-route-json-user" });

    const response = await PUT(
      new NextRequest("http://localhost:3000/api/me/profile", {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-id-token",
          "Content-Type": "application/json",
        },
        body: "{",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
    expect(await prisma.userProfile.count()).toBe(0);
  });

  it("지원하지 않는 선호 종목이면 400을 반환하고 저장하지 않는다", async () => {
    verifyIdToken.mockResolvedValue({ uid: "profile-route-invalid-user" });

    const response = await PUT(
      requestFor("PUT", {
        ...profileInput,
        preferredSports: ["축구"],
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("지원하지 않는 선호 종목입니다: 축구");
    expect(await prisma.userProfile.count()).toBe(0);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 저장하지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await PUT(requestFor("PUT", profileInput));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toEqual(expect.stringContaining("expired token"));
    expect(await prisma.userProfile.count()).toBe(0);
  });
});
