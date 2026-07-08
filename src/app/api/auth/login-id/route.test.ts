import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/login-id/route";
import { prisma } from "@/lib/server/prisma-client";

const { getUser, createCustomToken, verifyEmailPassword, checkRateLimit } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    createCustomToken: vi.fn(),
    verifyEmailPassword: vi.fn(),
    checkRateLimit: vi.fn(),
  }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ getUser, createCustomToken }),
}));

vi.mock("@/lib/server/firebase-password-verify", () => ({
  verifyEmailPassword,
}));

vi.mock("@/lib/server/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/rate-limit")>();
  return { ...actual, checkRateLimit };
});

function requestFor(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/login-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createProfile(userId: string, loginId: string) {
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

describe("POST /api/auth/login-id", () => {
  beforeEach(() => {
    getUser.mockReset();
    createCustomToken.mockReset();
    verifyEmailPassword.mockReset();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({
      ok: true,
      remaining: 19,
      resetAt: new Date(),
    });
  });

  it("아이디·비번이 맞으면 customToken을 발급한다", async () => {
    await createProfile("auth-user", "loginok01");
    getUser.mockResolvedValue({ uid: "auth-user", email: "u@example.com" });
    verifyEmailPassword.mockResolvedValue({ ok: true, uid: "auth-user" });
    createCustomToken.mockResolvedValue("ct-token");

    const response = await POST(
      requestFor({ loginId: "loginok01", password: "Passw0rd!" }),
    );
    const body = (await response.json()) as { customToken?: string };

    expect(response.status).toBe(200);
    expect(body.customToken).toBe("ct-token");
    expect(verifyEmailPassword).toHaveBeenCalledWith(
      "u@example.com",
      "Passw0rd!",
    );
  });

  it("존재하지 않는 아이디는 generic 401 (enumeration 방지)", async () => {
    const response = await POST(
      requestFor({ loginId: "nosuchid1", password: "Passw0rd!" }),
    );
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(401);
    expect(body.message).toBe("아이디 또는 비밀번호가 올바르지 않습니다.");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("비밀번호가 틀리면 generic 401", async () => {
    await createProfile("auth-user-2", "loginbad01");
    getUser.mockResolvedValue({ uid: "auth-user-2", email: "b@example.com" });
    verifyEmailPassword.mockResolvedValue({
      ok: false,
      reason: "invalid-credentials",
    });

    const response = await POST(
      requestFor({ loginId: "loginbad01", password: "wrong" }),
    );
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(401);
    expect(body.message).toBe("아이디 또는 비밀번호가 올바르지 않습니다.");
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("이메일이 없는 계정은 generic 401", async () => {
    await createProfile("auth-user-3", "loginnone1");
    getUser.mockResolvedValue({ uid: "auth-user-3", email: undefined });

    const response = await POST(
      requestFor({ loginId: "loginnone1", password: "Passw0rd!" }),
    );
    expect(response.status).toBe(401);
    expect(verifyEmailPassword).not.toHaveBeenCalled();
  });

  it("rate limit 초과면 429", async () => {
    checkRateLimit.mockResolvedValue({
      ok: false,
      retryAfterSeconds: 60,
      resetAt: new Date(),
    });

    const response = await POST(
      requestFor({ loginId: "loginok01", password: "Passw0rd!" }),
    );
    expect(response.status).toBe(429);
  });

  it("per-IP는 통과해도 per-loginId 한도 초과면 429 (분산 IP 무차별 대입 캡)", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ ok: true, remaining: 19, resetAt: new Date() })
      .mockResolvedValueOnce({
        ok: false,
        retryAfterSeconds: 600,
        resetAt: new Date(),
      });

    const response = await POST(
      requestFor({ loginId: "loginok01", password: "Passw0rd!" }),
    );

    expect(response.status).toBe(429);
    // 두 번째 검사가 아이디 단위 스코프인지 확인.
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        scope: "login-id:target",
        identifier: "loginok01",
      }),
    );
    // 한도에 걸리면 계정 조회·비밀번호 검증으로 진행하지 않는다.
    expect(getUser).not.toHaveBeenCalled();
    expect(verifyEmailPassword).not.toHaveBeenCalled();
  });
});
