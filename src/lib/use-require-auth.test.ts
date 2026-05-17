import { describe, expect, it } from "vitest";
import { sanitizeFromPath } from "@/lib/use-require-auth";

describe("sanitizeFromPath (open redirect 방어)", () => {
  it("같은 origin의 path는 허용한다", () => {
    expect(sanitizeFromPath("/mypage")).toBe("/mypage");
    expect(sanitizeFromPath("/reservations/123")).toBe("/reservations/123");
    expect(sanitizeFromPath("/gyms?sport=농구")).toBe("/gyms?sport=농구");
  });

  it("null/undefined/빈 문자열은 null을 반환한다", () => {
    expect(sanitizeFromPath(null)).toBeNull();
    expect(sanitizeFromPath(undefined)).toBeNull();
    expect(sanitizeFromPath("")).toBeNull();
  });

  it("'/'로 시작하지 않는 값은 거부한다", () => {
    expect(sanitizeFromPath("mypage")).toBeNull();
    expect(sanitizeFromPath("http://evil.com")).toBeNull();
    expect(sanitizeFromPath("https://evil.com")).toBeNull();
    expect(sanitizeFromPath("javascript:alert(1)")).toBeNull();
  });

  it("'//'로 시작하는 protocol-relative URL은 거부한다", () => {
    expect(sanitizeFromPath("//evil.com")).toBeNull();
    expect(sanitizeFromPath("//evil.com/path")).toBeNull();
  });

  it("backslash가 섞이면 거부한다", () => {
    expect(sanitizeFromPath("/\\evil.com")).toBeNull();
    expect(sanitizeFromPath("\\\\evil.com")).toBeNull();
  });

  it("'/scheme:'로 시작하는 패턴은 거부한다", () => {
    expect(sanitizeFromPath("/http://evil.com")).toBeNull();
    expect(sanitizeFromPath("/javascript:alert(1)")).toBeNull();
  });
});
