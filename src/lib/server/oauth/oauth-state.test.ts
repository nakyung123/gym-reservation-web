import { describe, expect, it } from "vitest";
import {
  OAUTH_ATTEMPT_COOKIE,
  generateOpaqueToken,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";

describe("generateOpaqueToken", () => {
  it("매 호출마다 다른 토큰을 반환한다", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
  });

  it("토큰은 base64url 문자만 포함하며 32자 이상이다", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });
});

describe("safeEqualToken", () => {
  it("같은 문자열이면 true", () => {
    const token = generateOpaqueToken();
    expect(safeEqualToken(token, token)).toBe(true);
  });

  it("다른 문자열이면 false", () => {
    expect(safeEqualToken("abc", "def")).toBe(false);
  });

  it("길이가 다르면 false", () => {
    expect(safeEqualToken("abc", "abcd")).toBe(false);
  });

  it("문자열이 아닌 값에는 false", () => {
    expect(safeEqualToken(null as unknown as string, "abc")).toBe(false);
    expect(safeEqualToken("abc", undefined as unknown as string)).toBe(false);
  });
});

describe("OAUTH_ATTEMPT_COOKIE", () => {
  it("쿠키 이름이 정의되어 있다", () => {
    expect(typeof OAUTH_ATTEMPT_COOKIE).toBe("string");
    expect(OAUTH_ATTEMPT_COOKIE.length).toBeGreaterThan(0);
  });
});
