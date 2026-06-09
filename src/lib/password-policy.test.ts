import { describe, expect, it } from "vitest";
import { validatePasswordPolicy } from "@/lib/password-policy";

describe("validatePasswordPolicy", () => {
  it("빈 문자열은 아직 입력 안 한 것으로 보고 null을 반환한다", () => {
    expect(validatePasswordPolicy("")).toBeNull();
  });

  it("8자 미만이면 길이 사유를 반환한다", () => {
    expect(validatePasswordPolicy("Aa1!")).toBe(
      "비밀번호는 8자 이상이어야 합니다.",
    );
  });

  it("영문 소문자가 없으면 소문자 사유를 반환한다", () => {
    expect(validatePasswordPolicy("ABCD1234!")).toBe(
      "비밀번호에 영문 소문자를 포함해 주세요.",
    );
  });

  it("숫자가 없으면 숫자 사유를 반환한다", () => {
    expect(validatePasswordPolicy("abcdefg!")).toBe(
      "비밀번호에 숫자를 포함해 주세요.",
    );
  });

  it("특수문자가 없으면 특수문자 사유를 반환한다", () => {
    expect(validatePasswordPolicy("abcd1234")).toBe(
      "비밀번호에 특수문자(!@#$ 등)를 포함해 주세요.",
    );
  });

  it("정책을 모두 충족하면 null을 반환한다", () => {
    expect(validatePasswordPolicy("abcd1234!")).toBeNull();
  });
});
