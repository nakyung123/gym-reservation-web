import { afterEach, describe, expect, it } from "vitest";
import { isDemoUser } from "@/lib/server/demo-account";

// DEMO_USER_UID는 운영에서만 설정한다. 미설정이 기본이며, 그때는 아무도 데모로 보지 않아야 한다.
const original = process.env.DEMO_USER_UID;

afterEach(() => {
  if (original === undefined) delete process.env.DEMO_USER_UID;
  else process.env.DEMO_USER_UID = original;
});

describe("isDemoUser", () => {
  it("환경변수가 없으면 어떤 uid도 데모가 아니다", () => {
    delete process.env.DEMO_USER_UID;
    expect(isDemoUser("any-uid")).toBe(false);
  });

  it("빈 문자열이어도 데모로 보지 않는다", () => {
    process.env.DEMO_USER_UID = "   ";
    expect(isDemoUser("")).toBe(false);
    expect(isDemoUser("any-uid")).toBe(false);
  });

  it("설정된 uid와 정확히 일치할 때만 true", () => {
    process.env.DEMO_USER_UID = "demo-uid-123";
    expect(isDemoUser("demo-uid-123")).toBe(true);
    expect(isDemoUser("demo-uid-1234")).toBe(false);
    expect(isDemoUser("other-uid")).toBe(false);
  });

  it("앞뒤 공백은 무시하고 비교한다", () => {
    process.env.DEMO_USER_UID = "  demo-uid-123  ";
    expect(isDemoUser("demo-uid-123")).toBe(true);
  });
});
