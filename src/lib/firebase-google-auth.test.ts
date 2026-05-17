import { afterEach, describe, expect, it, vi } from "vitest";

const { GoogleAuthProvider, signInWithPopup, getFirebaseClient } = vi.hoisted(
  () => ({
    GoogleAuthProvider: vi.fn(),
    signInWithPopup: vi.fn(),
    getFirebaseClient: vi.fn(),
  }),
);

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider,
  signInWithPopup,
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

import { signInWithGoogle } from "@/lib/firebase-google-auth";

function mockAuthForSignIn() {
  getFirebaseClient.mockReturnValue({ auth: {} });
}

function makeFirebaseError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

describe("signInWithGoogle", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("성공 시 ok:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockResolvedValue({ user: {} });

    const result = await signInWithGoogle();

    expect(result).toEqual({ ok: true });
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("popup-closed-by-user 오류는 cancelled:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/popup-closed-by-user"),
    );

    const result = await signInWithGoogle();
    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("cancelled-popup-request 오류는 cancelled:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/cancelled-popup-request"),
    );

    const result = await signInWithGoogle();
    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("account-exists-with-different-credential은 안내 메시지를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/account-exists-with-different-credential"),
    );

    const result = await signInWithGoogle();
    expect(result).toMatchObject({ ok: false, cancelled: false });
    expect(
      (result as Extract<typeof result, { cancelled: false }>).message,
    ).toContain("다른 로그인 방식");
  });

  it("알 수 없는 오류는 Error.message를 그대로 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(makeFirebaseError("auth/unknown", "boom"));

    const result = await signInWithGoogle();
    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "boom",
    });
  });
});
