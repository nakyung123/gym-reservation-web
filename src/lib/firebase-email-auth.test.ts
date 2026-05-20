import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createUserWithEmailAndPassword,
  getFirebaseClient,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  getFirebaseClient: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
}));

import {
  resendEmailVerification,
  sendPasswordReset,
  signInWithEmail,
  signupWithEmail,
} from "@/lib/firebase-email-auth";

function makeAuthError(code: string, message = "") {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

describe("firebase email auth helpers", () => {
  beforeEach(() => {
    createUserWithEmailAndPassword.mockReset();
    getFirebaseClient.mockReset();
    sendEmailVerification.mockReset();
    sendPasswordResetEmail.mockReset();
    signInWithEmailAndPassword.mockReset();
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signup succeeds and reports whether verification mail was sent", async () => {
    const user = { uid: "email-signup-user" };
    createUserWithEmailAndPassword.mockResolvedValue({ user });
    sendEmailVerification.mockResolvedValue(undefined);

    await expect(
      signupWithEmail({ email: "user@example.com", password: "password123" }),
    ).resolves.toEqual({ ok: true, emailVerificationSent: true });

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      "user@example.com",
      "password123",
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it("signup verification mail failure does not fail signup", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createUserWithEmailAndPassword.mockResolvedValue({
      user: { uid: "email-signup-no-verification-user" },
    });
    sendEmailVerification.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw verification error"),
    );

    await expect(
      signupWithEmail({ email: "user@example.com", password: "password123" }),
    ).resolves.toEqual({ ok: true, emailVerificationSent: false });
  });

  it("signup unknown Firebase errors do not expose the raw error message", async () => {
    createUserWithEmailAndPassword.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw signup error"),
    );

    const result = await signupWithEmail({
      email: "user@example.com",
      password: "password123",
    });

    expect(result).toEqual({
      ok: false,
      reason: "other",
      message: "회원가입에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Firebase raw");
    }
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
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
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

  it("resend verification requires a current user", async () => {
    await expect(resendEmailVerification()).resolves.toEqual({
      ok: false,
      message: "로그인 후 이메일 인증을 재전송할 수 있습니다.",
    });
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it("resend verification unknown Firebase errors do not expose the raw error message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = { uid: "email-verification-user" };
    getFirebaseClient.mockReturnValue({ auth: { currentUser: user } });
    sendEmailVerification.mockRejectedValue(
      makeAuthError("auth/internal-error", "Firebase raw verification error"),
    );

    const result = await resendEmailVerification();

    expect(result).toEqual({
      ok: false,
      message: "이메일 인증 메일을 다시 보내지 못했습니다.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("Firebase raw");
    }
  });
});
