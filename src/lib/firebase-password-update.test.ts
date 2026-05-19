import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFirebaseClient, reauthenticateWithCredential, updatePassword, credentialMock } =
  vi.hoisted(() => ({
    getFirebaseClient: vi.fn(),
    reauthenticateWithCredential: vi.fn(),
    updatePassword: vi.fn(),
    credentialMock: vi.fn(),
  }));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: credentialMock },
  reauthenticateWithCredential,
  updatePassword,
}));

import { updateMyPassword } from "@/lib/firebase-password-update";

function mockCurrentUser(user: { email?: string | null } | null) {
  getFirebaseClient.mockReturnValue({
    auth: { currentUser: user },
  });
}

function makeAuthError(code: string, message = "") {
  // 두 번째 인자를 안 주면 message는 빈 문자열. mapError의 default 분기에서
  // error.message가 falsy일 때 stage별 기본 메시지를 검증하기 위함이다.
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

describe("updateMyPassword", () => {
  beforeEach(() => {
    getFirebaseClient.mockReset();
    reauthenticateWithCredential.mockReset();
    updatePassword.mockReset();
    credentialMock.mockReset();
    credentialMock.mockImplementation((email: string, password: string) => ({
      email,
      password,
    }));
  });

  it("로그인 사용자가 없으면 no-user 사유로 실패한다", async () => {
    mockCurrentUser(null);

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "no-user",
      message: "로그인 상태가 아닙니다. 다시 로그인해 주세요.",
    });
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it("이메일이 없는 계정이면 no-email 사유로 실패한다", async () => {
    mockCurrentUser({ email: null });

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "no-email",
      message: "이메일 정보가 없는 계정은 비밀번호를 변경할 수 없습니다.",
    });
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it("재인증과 비밀번호 변경에 모두 성공하면 ok를 반환한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockResolvedValue(undefined);

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({ ok: true });

    expect(credentialMock).toHaveBeenCalledWith("user@example.com", "old");
    expect(reauthenticateWithCredential).toHaveBeenCalledOnce();
    expect(updatePassword).toHaveBeenCalledOnce();
  });

  it("auth/wrong-password 재인증 실패는 wrong-current-password로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockRejectedValue(
      makeAuthError("auth/wrong-password"),
    );

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "wrong-current-password",
      message: "현재 비밀번호가 일치하지 않습니다.",
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("auth/invalid-credential 재인증 실패도 wrong-current-password로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockRejectedValue(
      makeAuthError("auth/invalid-credential"),
    );

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "wrong-current-password",
    });
  });

  it("auth/invalid-login-credentials도 wrong-current-password로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockRejectedValue(
      makeAuthError("auth/invalid-login-credentials"),
    );

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "wrong-current-password",
    });
  });

  it("재인증 단계의 알 수 없는 에러는 재인증 메시지로 other 사유로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockRejectedValue(makeAuthError("auth/unknown"));

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "other",
      message: "재인증에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("auth/weak-password 변경 실패는 weak-password로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockRejectedValue(makeAuthError("auth/weak-password"));

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "short" }),
    ).resolves.toEqual({
      ok: false,
      reason: "weak-password",
      message: "새 비밀번호가 너무 약합니다. 8자 이상으로 설정해 주세요.",
    });
  });

  it("auth/requires-recent-login은 requires-recent-login으로 매핑한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockRejectedValue(makeAuthError("auth/requires-recent-login"));

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "requires-recent-login",
      message: "보안을 위해 다시 로그인한 뒤 시도해 주세요.",
    });
  });

  it("변경 단계의 알 수 없는 에러는 변경 메시지로 other 사유로 매핑하고 error.message를 사용한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockRejectedValue(
      makeAuthError("auth/unknown", "원본 에러 메시지"),
    );

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "other",
      message: "원본 에러 메시지",
    });
  });

  it("error.message가 없는 변경 실패는 변경 단계 기본 메시지를 사용한다", async () => {
    mockCurrentUser({ email: "user@example.com" });
    reauthenticateWithCredential.mockResolvedValue(undefined);
    updatePassword.mockRejectedValue({ code: "auth/unknown" });

    await expect(
      updateMyPassword({ currentPassword: "old", newPassword: "newpass1" }),
    ).resolves.toEqual({
      ok: false,
      reason: "other",
      message: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  });
});
