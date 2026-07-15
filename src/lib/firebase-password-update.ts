import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 비밀번호 변경 helper. 현재 비밀번호로 재인증 후 새 비밀번호로 갱신한다.
// password provider가 아닌 계정(소셜)에서는 호출하지 말 것 (재인증 자체가 불가).

export type UpdatePasswordResult =
  | { ok: true }
  | { ok: false; reason: UpdatePasswordFailureReason; message: string };

export type UpdatePasswordFailureReason =
  | "no-user"
  | "no-email"
  | "wrong-current-password"
  | "weak-password"
  | "requires-recent-login"
  | "other";

// 재인증만 수행한다(비밀번호 변경 없음). 회원정보변경 진입 게이트에서 본인 확인용으로 쓴다.
// password provider가 아닌 계정(소셜)에서는 호출하지 말 것 (재인증 자체가 불가).
export async function reauthenticateMyPassword(
  password: string,
): Promise<UpdatePasswordResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "no-user",
      message: "로그인 상태가 아닙니다. 다시 로그인해 주세요.",
    };
  }
  if (!user.email) {
    return {
      ok: false,
      reason: "no-email",
      message: "이메일 정보가 없는 계정은 본인 확인을 할 수 없습니다.",
    };
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return { ok: true };
  } catch (error) {
    return mapError(error, { stage: "reauth" });
  }
}

// 게이트(reauthenticateMyPassword)에서 이미 본인 확인을 마친 직후, 현재 비밀번호를
// 다시 받지 않고 새 비밀번호로 바로 갱신한다. 회원정보변경 폼(현재 비번 입력 없이
// 새 비번+확인)과 동일한 UX. 재인증 시한이 지나 updatePassword가 requires-recent-login을
// 던지면 mapError가 그 사유로 매핑하므로, 호출 측에서 게이트를 다시 잠그면 된다.
export async function updateMyPasswordDirect(
  newPassword: string,
): Promise<UpdatePasswordResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "no-user",
      message: "로그인 상태가 아닙니다. 다시 로그인해 주세요.",
    };
  }
  try {
    await updatePassword(user, newPassword);
    return { ok: true };
  } catch (error) {
    return mapError(error, { stage: "update" });
  }
}

export async function updateMyPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<UpdatePasswordResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "no-user",
      message: "로그인 상태가 아닙니다. 다시 로그인해 주세요.",
    };
  }
  if (!user.email) {
    return {
      ok: false,
      reason: "no-email",
      message: "이메일 정보가 없는 계정은 비밀번호를 변경할 수 없습니다.",
    };
  }

  try {
    const credential = EmailAuthProvider.credential(
      user.email,
      input.currentPassword,
    );
    await reauthenticateWithCredential(user, credential);
  } catch (error) {
    return mapError(error, { stage: "reauth" });
  }

  try {
    await updatePassword(user, input.newPassword);
    return { ok: true };
  } catch (error) {
    return mapError(error, { stage: "update" });
  }
}

function mapError(
  error: unknown,
  context: { stage: "reauth" | "update" },
): UpdatePasswordResult {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return {
        ok: false,
        reason: "wrong-current-password",
        message: "현재 비밀번호가 일치하지 않습니다.",
      };
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      // Firebase 프로젝트 비밀번호 정책(8자+/소문자/숫자/특수문자) 미충족.
      // 클라 검증이 안전망 역할을 하지만 정책 변경/우회 시 여기서 구체 안내한다.
      return {
        ok: false,
        reason: "weak-password",
        message:
          "새 비밀번호가 약합니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요.",
      };
    case "auth/requires-recent-login":
      return {
        ok: false,
        reason: "requires-recent-login",
        message: "보안을 위해 다시 로그인한 뒤 시도해 주세요.",
      };
    default:
      return {
        ok: false,
        reason: "other",
        message:
          context.stage === "reauth"
            ? "재인증에 실패했습니다. 잠시 후 다시 시도해 주세요."
            : "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
  }
}
