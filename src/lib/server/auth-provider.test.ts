import { describe, expect, it } from "vitest";
import { resolveAuthProvider } from "@/lib/server/auth-provider";

describe("resolveAuthProvider", () => {
  it("uid 'kakao:' prefix는 kakao로 산출한다", () => {
    expect(
      resolveAuthProvider({ uid: "kakao:1234", signInProvider: "custom" }),
    ).toBe("kakao");
  });

  it("uid 'naver:' prefix는 naver로 산출한다", () => {
    expect(
      resolveAuthProvider({ uid: "naver:abc", signInProvider: "custom" }),
    ).toBe("naver");
  });

  it("signInProvider === 'password'는 local로 산출한다", () => {
    expect(
      resolveAuthProvider({ uid: "abc123", signInProvider: "password" }),
    ).toBe("local");
  });

  it("signInProvider === 'google.com'은 google로 산출한다", () => {
    expect(
      resolveAuthProvider({ uid: "abc123", signInProvider: "google.com" }),
    ).toBe("google");
  });

  it("uid prefix가 signInProvider보다 우선한다 (kakao/naver는 custom token이라 sign_in_provider가 custom)", () => {
    expect(
      resolveAuthProvider({ uid: "kakao:1", signInProvider: "google.com" }),
    ).toBe("kakao");
  });

  it("알 수 없는 조합은 null을 반환한다 (조용히 잘못된 값을 채우지 않는다)", () => {
    expect(
      resolveAuthProvider({ uid: "abc", signInProvider: "anonymous" }),
    ).toBeNull();
    expect(resolveAuthProvider({ uid: "abc", signInProvider: "" })).toBeNull();
    expect(
      resolveAuthProvider({ uid: "abc", signInProvider: "custom" }),
    ).toBeNull();
  });
});
