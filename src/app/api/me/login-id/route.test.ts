import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/me/login-id/route";
import { prisma } from "@/lib/server/prisma-client";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(
  body: unknown,
  { idToken }: { idToken?: string } = { idToken: "token" },
) {
  return new NextRequest("http://localhost:3000/api/me/login-id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createProfile(userId: string, loginId: string | null) {
  await prisma.userProfile.create({
    data: {
      userId,
      loginId,
      preferredRegion: null,
      preferredSports: [],
      reservationNotificationsEnabled: true,
    },
  });
}

describe("POST /api/me/login-id", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({
      uid: "set-user",
      firebase: { sign_in_provider: "password" },
    });
  });

  it("인증 헤더가 없으면 401", async () => {
    const response = await POST(requestFor({ loginId: "newid01" }, {}));
    expect(response.status).toBe(401);
  });

  it("형식이 잘못된 아이디는 400", async () => {
    const response = await POST(requestFor({ loginId: "AB" }));
    const body = (await response.json()) as { message?: string };
    expect(response.status).toBe(400);
    expect(body.message).toContain("아이디");
  });

  it("미설정 프로필에 아이디를 1회 설정한다", async () => {
    await createProfile("set-user", null);

    const response = await POST(requestFor({ loginId: "chosenid1" }));
    const body = (await response.json()) as { loginId?: string };

    expect(response.status).toBe(200);
    expect(body.loginId).toBe("chosenid1");

    const row = await prisma.userProfile.findUnique({
      where: { userId: "set-user" },
      select: { loginId: true },
    });
    expect(row?.loginId).toBe("chosenid1");
  });

  it("이미 아이디가 설정돼 있으면 409(불변)", async () => {
    await createProfile("set-user", "already01");

    const response = await POST(requestFor({ loginId: "another01" }));
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(409);
    expect(body.message).toContain("이미 아이디가 설정");
  });

  it("다른 회원이 선점한 아이디면 409(taken)", async () => {
    await createProfile("set-user", null);
    await createProfile("other-user", "dupid001");

    const response = await POST(requestFor({ loginId: "dupid001" }));
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(409);
    expect(body.message).toContain("이미 사용 중");
  });

  it("프로필이 없으면 409(no-profile)", async () => {
    const response = await POST(requestFor({ loginId: "noprof01" }));
    expect(response.status).toBe(409);
  });
});
