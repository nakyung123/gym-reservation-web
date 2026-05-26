import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyAdminPageBasicAuth } from "@/lib/server/admin-page-auth";

const USER = "admin";
const PASSWORD = "s3cret-page";

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf-8").toString("base64")}`;
}

describe("verifyAdminPageBasicAuth", () => {
  let originalUser: string | undefined;
  let originalPassword: string | undefined;

  beforeEach(() => {
    originalUser = process.env.ADMIN_PAGE_USER;
    originalPassword = process.env.ADMIN_PAGE_PASSWORD;
    process.env.ADMIN_PAGE_USER = USER;
    process.env.ADMIN_PAGE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    if (originalUser === undefined) {
      delete process.env.ADMIN_PAGE_USER;
    } else {
      process.env.ADMIN_PAGE_USER = originalUser;
    }
    if (originalPassword === undefined) {
      delete process.env.ADMIN_PAGE_PASSWORD;
    } else {
      process.env.ADMIN_PAGE_PASSWORD = originalPassword;
    }
  });

  it("ADMIN_PAGE_USER가 비어 있으면 503(fail-closed)을 반환한다", () => {
    delete process.env.ADMIN_PAGE_USER;
    expect(verifyAdminPageBasicAuth(basic(USER, PASSWORD))).toEqual({
      ok: false,
      status: 503,
      reason: "not-configured",
    });
  });

  it("ADMIN_PAGE_PASSWORD가 비어 있으면 503(fail-closed)을 반환한다", () => {
    delete process.env.ADMIN_PAGE_PASSWORD;
    expect(verifyAdminPageBasicAuth(basic(USER, PASSWORD))).toEqual({
      ok: false,
      status: 503,
      reason: "not-configured",
    });
  });

  it("Authorization 헤더가 없으면 401(missing)을 반환한다", () => {
    expect(verifyAdminPageBasicAuth(null)).toEqual({
      ok: false,
      status: 401,
      reason: "missing",
    });
  });

  it("Basic scheme이 아니면 401(invalid)을 반환한다", () => {
    expect(verifyAdminPageBasicAuth("Bearer abc")).toEqual({
      ok: false,
      status: 401,
      reason: "invalid",
    });
  });

  it("scheme만 있고 인코딩 값이 비어 있으면 401(invalid)을 반환한다", () => {
    expect(verifyAdminPageBasicAuth("Basic ")).toEqual({
      ok: false,
      status: 401,
      reason: "invalid",
    });
  });

  it("base64 디코딩 결과에 콜론이 없으면 401(invalid)을 반환한다", () => {
    const encoded = Buffer.from("no-colon-token", "utf-8").toString("base64");
    expect(verifyAdminPageBasicAuth(`Basic ${encoded}`)).toEqual({
      ok: false,
      status: 401,
      reason: "invalid",
    });
  });

  it("user가 틀리면 401(invalid)을 반환한다", () => {
    expect(verifyAdminPageBasicAuth(basic("wrong", PASSWORD))).toEqual({
      ok: false,
      status: 401,
      reason: "invalid",
    });
  });

  it("password가 틀리면 401(invalid)을 반환한다", () => {
    expect(verifyAdminPageBasicAuth(basic(USER, "wrong"))).toEqual({
      ok: false,
      status: 401,
      reason: "invalid",
    });
  });

  it("올바른 자격이면 ok를 반환한다", () => {
    expect(verifyAdminPageBasicAuth(basic(USER, PASSWORD))).toEqual({
      ok: true,
    });
  });
});
