// @vitest-environment jsdom
// window.localStorage / window.location(가입 링크 저장·복귀)이 필요해 jsdom으로 돌린다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFirebaseClient,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  updatePassword,
} = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
  isSignInWithEmailLink: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("firebase/auth", () => ({
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  updatePassword,
}));

import {
  completeSignupEmailLink,
  getStoredSignupEmail,
  sendPasswordReset,
  sendSignupEmailLink,
  setSignupPassword,
  signInWithEmail,
} from "@/lib/firebase-email-auth";

const STORAGE_KEY = "signup:email-for-link";

function makeAuthError(code: string, message = "") {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

describe("firebase email auth helpers", () => {
  beforeEach(() => {
    getFirebaseClient.mockReset();
    isSignInWithEmailLink.mockReset();
    sendPasswordResetEmail.mockReset();
    sendSignInLinkToEmail.mockReset();
    signInWithEmailAndPassword.mockReset();
    signInWithEmailLink.mockReset();
    updatePassword.mockReset();
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signup link send targets /signup and persists the email for the return trip", async () => {
    sendSignInLinkToEmail.mockResolvedValue(undefined);

    await expect(sendSignupEmailLink("user@example.com")).resolves.toEqual({
      ok: true,
    });

    expect(sendSignInLinkToEmail).toHaveBeenCalledWith(
      expect.anything(),
      "user@example.com",
      {
        url: `${window.location.origin}/signup`,
        handleCodeInApp: true,
      },
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("user@example.com");
    expect(getStoredSignupEmail()).toBe("user@example.com");
  });

  it("signup link send console misconfiguration maps to an explicit not-configured message", async () => {
    sendSignInLinkToEmail.mockRejectedValue(
      makeAuthError("auth/operation-not-allowed"),
    );

    await expect(sendSignupEmailLink("user@example.com")).resolves.toEqual({
      ok: false,
      reason: "not-configured",
      message:
        "이메일 인증이 아직 활성화되지 않았습니다. 잠시 후에도 반복되면 관리자에게 문의해 주세요.",
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("signup link send unknown Firebase errors do not expose the raw error message", async () => {
    sendSignInLinkToEmail.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw link error"),
    );

    const result = await sendSignupEmailLink("user@example.com");

    expect(result).toEqual({
      ok: false,
      reason: "other",
      message: "인증 메일을 보내지 못했습니다. 다시 시도해 주세요.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Firebase raw");
    }
  });

  it("signup link completion clears the stored email on success", async () => {
    window.localStorage.setItem(STORAGE_KEY, "user@example.com");
    signInWithEmailLink.mockResolvedValue({ user: { uid: "link-user" } });

    await expect(
      completeSignupEmailLink("user@example.com", "https://app/signup?mode=signIn"),
    ).resolves.toEqual({ ok: true });

    expect(signInWithEmailLink).toHaveBeenCalledWith(
      expect.anything(),
      "user@example.com",
      "https://app/signup?mode=signIn",
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("signup link completion maps expired/used codes to invalid-link", async () => {
    signInWithEmailLink.mockRejectedValue(
      makeAuthError("auth/invalid-action-code"),
    );

    await expect(
      completeSignupEmailLink("user@example.com", "https://app/signup?mode=signIn"),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid-link",
      message:
        "인증 링크가 만료되었거나 이미 사용되었습니다. 인증 메일을 다시 받아 주세요.",
    });
  });

  it("signup link completion maps invalid-email to email-mismatch (cross-device re-entry)", async () => {
    signInWithEmailLink.mockRejectedValue(makeAuthError("auth/invalid-email"));

    await expect(
      completeSignupEmailLink("other@example.com", "https://app/signup?mode=signIn"),
    ).resolves.toEqual({
      ok: false,
      reason: "email-mismatch",
      message: "인증 메일을 받은 이메일 주소와 다릅니다. 다시 확인해 주세요.",
    });
  });

  it("set signup password requires a signed-in session", async () => {
    await expect(setSignupPassword("password123!")).resolves.toEqual({
      ok: false,
      reason: "no-session",
      message: "가입 세션이 만료됐습니다. 처음부터 다시 시도해 주세요.",
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("set signup password succeeds for the current user", async () => {
    const user = { uid: "link-user" };
    getFirebaseClient.mockReturnValue({ auth: { currentUser: user } });
    updatePassword.mockResolvedValue(undefined);

    await expect(setSignupPassword("password123!")).resolves.toEqual({ ok: true });
    expect(updatePassword).toHaveBeenCalledWith(user, "password123!");
  });

  it("set signup password weak/policy errors map to the policy message", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: { uid: "u" } } });
    updatePassword.mockRejectedValue(
      makeAuthError("auth/password-does-not-meet-requirements"),
    );

    await expect(setSignupPassword("abcd1234")).resolves.toEqual({
      ok: false,
      reason: "weak-password",
      message:
        "비밀번호가 약합니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요.",
    });
  });

  it("set signup password stale session maps to requires-recent-login guidance", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: { uid: "u" } } });
    updatePassword.mockRejectedValue(makeAuthError("auth/requires-recent-login"));

    await expect(setSignupPassword("password123!")).resolves.toEqual({
      ok: false,
      reason: "requires-recent-login",
      message:
        "보안을 위해 이메일 인증이 다시 필요합니다. 처음 화면에서 인증 메일을 다시 받아 주세요.",
    });
  });

  it("signin known credential errors use the safe credential message", async () => {
    signInWithEmailAndPassword.mockRejectedValue(
      makeAuthError("auth/wrong-password"),
    );

    await expect(
      signInWithEmail({ email: "user@example.com", password: "wrong" }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "invalid-credential",
      message: "아이디 또는 비밀번호가 올바르지 않습니다.",
    });
  });

  it("signin unknown Firebase errors do not expose the raw error message", async () => {
    signInWithEmailAndPassword.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw signin error"),
    );

    const result = await signInWithEmail({
      email: "user@example.com",
      password: "password123",
    });

    expect(result).toEqual({
      ok: false,
      reason: "other",
      message: "로그인에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Firebase raw");
    }
  });

  it("password reset unknown Firebase errors do not expose the raw error message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendPasswordResetEmail.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw reset error"),
    );

    const result = await sendPasswordReset("user@example.com");

    expect(result).toEqual({
      ok: false,
      message: "비밀번호 재설정 이메일을 보내지 못했습니다.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Firebase raw");
    }
  });
});
