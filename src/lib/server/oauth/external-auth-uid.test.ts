import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildExternalAuthUid } from "@/lib/server/oauth/external-auth-uid";

describe("buildExternalAuthUid", () => {
  it("카카오 number id를 string으로 정규화해서 prefix와 결합한다", () => {
    expect(buildExternalAuthUid("kakao", 123456789)).toBe("kakao:123456789");
  });

  it("네이버 string id를 trim한 뒤 prefix와 결합한다", () => {
    expect(buildExternalAuthUid("naver", "  abcDEF123  ")).toBe(
      "naver:abcDEF123",
    );
  });

  it("64자 경계의 id는 hash fallback 없이 그대로 반환한다", () => {
    // "kakao:" (6자) + 58자 id = 64자
    const id = "a".repeat(58);
    const uid = buildExternalAuthUid("kakao", id);
    expect(uid).toBe(`kakao:${id}`);
    expect(uid.length).toBe(64);
  });

  it("64자를 초과하는 id는 SHA-256 hash fallback uid로 대체한다", () => {
    // "naver:" (6자) + 59자 id = 65자 → fallback
    const id = "x".repeat(59);
    const uid = buildExternalAuthUid("naver", id);
    expect(uid.length).toBe(64);
    expect(uid.startsWith("naver:h_")).toBe(true);

    const hashHex = createHash("sha256").update(id).digest("hex");
    const expectedHashLength = 64 - "naver:".length - "h_".length;
    expect(uid).toBe(`naver:h_${hashHex.slice(0, expectedHashLength)}`);
  });

  it("hash fallback은 같은 입력에 대해 항상 같은 결과를 낸다 (SSOT 안정성)", () => {
    const id = "y".repeat(100);
    const uid1 = buildExternalAuthUid("kakao", id);
    const uid2 = buildExternalAuthUid("kakao", id);
    expect(uid1).toBe(uid2);
  });

  it("provider가 다르면 같은 id라도 다른 uid가 된다", () => {
    expect(buildExternalAuthUid("kakao", "abc")).not.toBe(
      buildExternalAuthUid("naver", "abc"),
    );
  });

  it("빈 문자열 id는 오류를 던진다", () => {
    expect(() => buildExternalAuthUid("kakao", "")).toThrow(/비어 있/);
  });

  it("공백만 있는 id는 trim 후 오류를 던진다", () => {
    expect(() => buildExternalAuthUid("naver", "   ")).toThrow(/비어 있/);
  });

  it("number id가 안전 정수 범위를 벗어나면 오류를 던진다", () => {
    expect(() =>
      buildExternalAuthUid("kakao", Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(/안전 정수/);
  });

  it("정수가 아닌 number는 오류를 던진다", () => {
    expect(() => buildExternalAuthUid("kakao", 1.5)).toThrow(/안전 정수/);
    expect(() => buildExternalAuthUid("kakao", Number.NaN)).toThrow(
      /안전 정수/,
    );
    expect(() => buildExternalAuthUid("kakao", Number.POSITIVE_INFINITY)).toThrow(
      /안전 정수/,
    );
  });
});
