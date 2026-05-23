import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFirebaseClient, onAuthStateChanged } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged,
}));

async function importSessionModule() {
  return import("@/lib/firebase-auth-session");
}

describe("firebase-auth-session", () => {
  beforeEach(() => {
    vi.resetModules();
    getFirebaseClient.mockReset();
    onAuthStateChanged.mockReset();
  });

  it("Firebase 클라이언트 초기화 오류를 사용자에게 그대로 노출하지 않는다", async () => {
    getFirebaseClient.mockImplementation(() => {
      throw new Error("raw firebase config secret");
    });
    const listener = vi.fn();
    const session = await importSessionModule();

    const unsubscribe = session.subscribeFirebaseAuthSession(listener);
    const result = session.getCurrentFirebaseAuthSession();

    expect(result).toEqual({
      ok: false,
      reason: "auth-unavailable",
      message: "Firebase 인증 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    });
    expect(result.ok ? "" : result.message).not.toContain("raw firebase");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("Firebase 인증 상태 구독 오류를 사용자에게 그대로 노출하지 않는다", async () => {
    const authUnsubscribe = vi.fn();
    onAuthStateChanged.mockImplementation((_auth, _onUser, onError) => {
      onError(new Error("observer raw failure"));
      return authUnsubscribe;
    });
    getFirebaseClient.mockReturnValue({ auth: {} });
    const listener = vi.fn();
    const session = await importSessionModule();

    const unsubscribe = session.subscribeFirebaseAuthSession(listener);
    const result = session.getCurrentFirebaseAuthSession();

    expect(result).toEqual({
      ok: false,
      reason: "auth-unavailable",
      message: "Firebase 인증 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    });
    expect(result.ok ? "" : result.message).not.toContain("observer raw");

    unsubscribe();
    expect(authUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
