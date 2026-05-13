import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";

function requestFor(token?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/test", {
    headers: token === undefined ? undefined : { "x-admin-token": token },
  });
}

describe("verifyAdminTokenFromRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when the admin token is not configured", () => {
    vi.stubEnv("ADMIN_API_TOKEN", "");

    expect(verifyAdminTokenFromRequest(requestFor("token"))).toEqual({
      ok: false,
      status: 503,
      message: "관리자 API 토큰이 설정되어 있지 않습니다.",
    });
  });

  it("returns 401 when the request has no admin token", () => {
    vi.stubEnv("ADMIN_API_TOKEN", "expected-token");

    expect(verifyAdminTokenFromRequest(requestFor())).toEqual({
      ok: false,
      status: 401,
      message: "관리자 API 토큰이 필요합니다.",
    });
  });

  it("returns 403 when the admin token does not match", () => {
    vi.stubEnv("ADMIN_API_TOKEN", "expected-token");

    expect(verifyAdminTokenFromRequest(requestFor("wrong-token"))).toEqual({
      ok: false,
      status: 403,
      message: "관리자 API 토큰이 올바르지 않습니다.",
    });
  });

  it("trims configured and request tokens before comparing", () => {
    vi.stubEnv("ADMIN_API_TOKEN", " expected-token ");

    expect(verifyAdminTokenFromRequest(requestFor(" expected-token "))).toEqual(
      { ok: true },
    );
  });
});
