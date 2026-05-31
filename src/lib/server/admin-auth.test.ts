import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { getAdminAuth } from "@/lib/server/firebase-admin";

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: vi.fn(),
}));

function requestWithAuthorization(value?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/test", {
    headers: value === undefined ? undefined : { authorization: value },
  });
}

function mockVerifyIdToken(
  impl: (
    idToken: string,
    checkRevoked?: boolean,
  ) => unknown | Promise<unknown>,
): ReturnType<typeof vi.fn> {
  const verifyIdToken = vi.fn(async (
    idToken: string,
    checkRevoked?: boolean,
  ) => impl(idToken, checkRevoked));
  vi.mocked(getAdminAuth).mockReturnValue({
    verifyIdToken,
  } as unknown as ReturnType<typeof getAdminAuth>);
  return verifyIdToken;
}

describe("verifyAdminTokenFromRequest (Firebase Custom Claim)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("Authorization 헤더가 없으면 401을 반환한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => ({ uid: "ignored" }));

    await expect(verifyAdminTokenFromRequest(requestWithAuthorization())).resolves.toEqual({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("Authorization 헤더가 Bearer 스킴이 아니면 401을 반환한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => ({ uid: "ignored" }));

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Basic abc")),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("Bearer 뒤 토큰이 비어 있으면 401을 반환한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => ({ uid: "ignored" }));

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Bearer   ")),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("verifyIdToken이 만료·회수된 토큰으로 throw하면 401을 반환한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => {
      throw new Error("token expired or revoked");
    });

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Bearer expired-token")),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      message: "관리자 인증에 실패했습니다.",
    });
    expect(verifyIdToken).toHaveBeenCalledWith("expired-token", true);
  });

  it("decoded token에 admin claim이 없으면 403을 반환한다", async () => {
    mockVerifyIdToken(() => ({ uid: "user-a" }));

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Bearer normal-user-token")),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      message: "관리자 권한이 없습니다.",
    });
  });

  it("admin claim이 true가 아닌 다른 값(문자열, false 등)이면 403을 반환한다", async () => {
    mockVerifyIdToken(() => ({ uid: "user-b", admin: "true" }));

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Bearer spoof-token")),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      message: "관리자 권한이 없습니다.",
    });
  });

  it("admin claim이 정확히 true(boolean)이면 ok + uid를 반환한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => ({
      uid: "admin-uid-1",
      admin: true,
    }));

    await expect(
      verifyAdminTokenFromRequest(requestWithAuthorization("Bearer admin-token")),
    ).resolves.toEqual({ ok: true, uid: "admin-uid-1" });
    expect(verifyIdToken).toHaveBeenCalledWith("admin-token", true);
  });

  it("Bearer 토큰 앞뒤 공백은 trim해서 verify에 전달한다", async () => {
    const verifyIdToken = mockVerifyIdToken(() => ({
      uid: "admin-uid-2",
      admin: true,
    }));

    await expect(
      verifyAdminTokenFromRequest(
        requestWithAuthorization("Bearer   admin-token-with-padding   "),
      ),
    ).resolves.toEqual({ ok: true, uid: "admin-uid-2" });
    expect(verifyIdToken).toHaveBeenCalledWith(
      "admin-token-with-padding",
      true,
    );
  });
});
