import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithCustomToken, getFirebaseClient } = vi.hoisted(() => ({
  signInWithCustomToken: vi.fn(),
  getFirebaseClient: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  signInWithCustomToken,
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

import { finalizeKakaoHandover } from "@/lib/firebase-kakao-auth";

describe("finalizeKakaoHandover", () => {
  beforeEach(() => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    signInWithCustomToken.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("토큰 교환 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await finalizeKakaoHandover({ ticketId: "ticket-id" });

    expect(result).toEqual({
      ok: false,
      reason: "other",
      message: "토큰 교환 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("Firebase 로그인 실패는 Firebase 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ customToken: "custom-token" })),
    );
    signInWithCustomToken.mockRejectedValueOnce(
      new Error("firebase internal detail"),
    );

    const result = await finalizeKakaoHandover({ ticketId: "ticket-id" });

    expect(result).toEqual({
      ok: false,
      reason: "other",
      message: "카카오 로그인에 실패했습니다. 처음부터 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("firebase internal detail");
  });
});
