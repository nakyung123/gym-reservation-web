import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(authorization?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    headers:
      authorization === undefined ? undefined : { Authorization: authorization },
  });
}

function requestWithRawAuthorization(authorization: string): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? authorization : null,
    },
  } as unknown as NextRequest;
}

describe("verifyIdTokenFromRequest", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("returns 401 without calling Firebase when Authorization is missing", async () => {
    await expect(verifyIdTokenFromRequest(requestFor())).resolves.toEqual({
      ok: false,
      status: 401,
      message: "Authorization 헤더가 없습니다.",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 401 without calling Firebase when the bearer token is empty", async () => {
    await expect(
      verifyIdTokenFromRequest(requestWithRawAuthorization("Bearer   ")),
    ).resolves.toEqual({
        ok: false,
        status: 401,
        message: "ID 토큰이 비어있습니다.",
      });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("verifies a trimmed bearer token and returns the Firebase uid", async () => {
    verifyIdToken.mockResolvedValue({ uid: "firebase-user-1" });

    await expect(
      verifyIdTokenFromRequest(requestFor("Bearer   token-1   ")),
    ).resolves.toEqual({ ok: true, uid: "firebase-user-1" });
    expect(verifyIdToken).toHaveBeenCalledWith("token-1");
  });

  it("returns 401 with the verification error detail when Firebase rejects the token", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired token"));

    const result = await verifyIdTokenFromRequest(requestFor("Bearer token-1"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(result.message).toContain("ID 토큰 검증에 실패했습니다");
    expect(result.message).toContain("expired token");
  });
});
