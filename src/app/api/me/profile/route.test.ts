import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, PUT } from "@/app/api/me/profile/route";
import { prisma } from "@/lib/server/prisma-client";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

// Firebase Admin verifyIdToken 응답은 decoded.firebase.sign_in_provider를 포함한다.
// 새 흐름에서 server가 그 값을 provider 산출에 사용하므로 mock에도 포함시킨다.
function mockVerify(uid: string, signInProvider = "password") {
  verifyIdToken.mockResolvedValue({
    uid,
    firebase: { sign_in_provider: signInProvider },
  });
}

function requestFor(method: "GET" | "POST" | "PUT", body?: unknown) {
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
    mockVerify("profile-route-empty-user");

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
    mockVerify(userId);
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

  it("ID 토큰 검증에 실패하면 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await GET(requestFor("GET"));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
  });

  it("프로필 조회 중 DB 오류가 발생하면 JSON 500을 반환한다", async () => {
    mockVerify("profile-route-get-error-user");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(prisma.userProfile, "findUnique").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await GET(requestFor("GET"));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("프로필 설정을 불러오지 못했습니다.");
    errorSpy.mockRestore();
  });
});

describe("PUT /api/me/profile", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("프로필 설정을 생성하고 입력을 정리한다", async () => {
    mockVerify("profile-route-put-user");

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
    mockVerify("profile-route-idempotent-user");

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
    mockVerify("profile-route-json-user");

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
    mockVerify("profile-route-invalid-user");

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

  it("닉네임 길이 제한을 넘으면 400을 반환하고 저장하지 않는다", async () => {
    mockVerify("profile-route-long-nickname-user");

    const response = await PUT(
      requestFor("PUT", {
        ...profileInput,
        nickname: "가".repeat(9),
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(400);
    expect(body.message).toBe("닉네임은 8자 이하로 입력해야 합니다.");
    expect(await prisma.userProfile.count()).toBe(0);
  });

  it("ID 토큰 검증에 실패하면 401을 반환하고 저장하지 않는다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await PUT(requestFor("PUT", profileInput));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(await prisma.userProfile.count()).toBe(0);
  });

  it("프로필 저장 중 DB 오류가 발생하면 JSON 500을 반환한다", async () => {
    mockVerify("profile-route-put-error-user");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(prisma.userProfile, "upsert").mockRejectedValueOnce(
      new Error("database offline"),
    );

    const response = await PUT(requestFor("PUT", profileInput));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe("프로필 설정을 저장하지 못했습니다.");
    errorSpy.mockRestore();
  });

  it("다른 사용자의 닉네임과 충돌하면 409를 반환하고 새 프로필을 만들지 않는다", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "profile-route-nickname-owner",
        nickname: "중복닉",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
      },
    });
    mockVerify("profile-route-nickname-conflict-user");

    const response = await PUT(
      requestFor("PUT", {
        ...profileInput,
        nickname: "중복닉",
      }),
    );
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(409);
    expect(body.message).toBe("이미 사용 중인 닉네임입니다.");
    await expect(
      prisma.userProfile.count({
        where: { userId: "profile-route-nickname-conflict-user" },
      }),
    ).resolves.toBe(0);
  });

  it("PUT은 클라이언트 입력이 아닌 server 산출 provider로 저장한다", async () => {
    mockVerify("profile-route-provider-user", "password");

    // 클라이언트가 다른 provider 값을 본문에 끼워 보내도 무시되어야 한다.
    const response = await PUT(
      requestFor("PUT", { ...profileInput, provider: "kakao" }),
    );
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: "profile-route-provider-user" },
    });
    expect(stored.provider).toBe("local");
  });
});

describe("POST /api/me/profile", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("프로필이 없으면 자동 닉네임으로 보장하고 산출된 provider를 채운다", async () => {
    mockVerify("profile-route-post-user", "password");

    const response = await POST(requestFor("POST"));
    const body = (await response.json()) as {
      profile?: { userId?: unknown; provider?: unknown; nickname?: unknown };
    };
    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({
      userId: "profile-route-post-user",
      provider: "local",
    });
    // 자동 생성된 닉네임이 비어있지 않고 8자 이내인지 확인.
    expect(typeof body.profile?.nickname).toBe("string");
    expect(
      [...((body.profile?.nickname as string | undefined) ?? "")].length,
    ).toBeGreaterThan(0);
    expect(
      [...((body.profile?.nickname as string | undefined) ?? "")].length,
    ).toBeLessThanOrEqual(8);
  });

  it("ID 토큰 검증에 실패하면 프로필을 보장하지 않고 401을 반환한다", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const response = await POST(requestFor("POST"));
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(401);
    expect(body.message).toBe("ID 토큰 검증에 실패했습니다.");
    expect(await prisma.userProfile.count()).toBe(0);
  });

  it("uid 'kakao:' prefix면 sign_in_provider가 custom이어도 provider=kakao로 저장", async () => {
    mockVerify("kakao:9999", "custom");

    const response = await POST(requestFor("POST"));
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: "kakao:9999" },
    });
    expect(stored.provider).toBe("kakao");
  });

  it("uid 'naver:' prefix면 sign_in_provider가 custom이어도 provider=naver로 저장", async () => {
    mockVerify("naver:9999", "custom");

    const response = await POST(requestFor("POST"));
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: "naver:9999" },
    });
    expect(stored.provider).toBe("naver");
  });

  it("기존 프로필이 있으면 nickname 등은 유지하고 provider만 동기화한다", async () => {
    const userId = "profile-route-existing-user";
    await prisma.userProfile.create({
      data: {
        userId,
        nickname: "직접입력",
        preferredRegion: null,
        preferredSports: [],
        reservationNotificationsEnabled: true,
        provider: null,
      },
    });
    mockVerify(userId, "google.com");

    const response = await POST(requestFor("POST"));
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { userId },
    });
    expect(stored.nickname).toBe("직접입력");
    expect(stored.provider).toBe("google");
  });

  it("알 수 없는 sign_in_provider 조합은 provider=null로 둔다 (조용히 잘못된 값을 채우지 않는다)", async () => {
    mockVerify("profile-route-unknown-provider-user", "anonymous");

    const response = await POST(requestFor("POST"));
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: "profile-route-unknown-provider-user" },
    });
    expect(stored.provider).toBeNull();
  });

  it("프로필 보장 중 DB 오류가 발생하면 JSON 500을 반환한다", async () => {
    mockVerify("profile-route-post-error-user", "password");
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const findSpy = vi
      .spyOn(prisma.userProfile, "findUnique")
      .mockRejectedValueOnce(new Error("database offline"));

    try {
      const response = await POST(requestFor("POST"));
      const body = (await response.json()) as { message?: unknown };

      expect(response.status).toBe(500);
      expect(body.message).toBe("프로필을 초기화하지 못했습니다.");
    } finally {
      findSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
