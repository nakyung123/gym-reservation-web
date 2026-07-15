import {
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  updatePassword,
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 자체 이메일 가입/로그인/재설정 helper. Firebase Auth 기반.
// 가입은 "가입 전 인증" 흐름: 이메일 링크(sendSignInLinkToEmail)로 소유를 먼저 증명한 뒤
// 위저드에서 비밀번호를 설정(updatePassword)한다. 계정을 먼저 만들고 인증 메일을 보내는
// 방식(createUserWithEmailAndPassword + sendEmailVerification)은 사용하지 않는다.

// 링크 발송 시 이메일을 보관하는 localStorage 키. 같은 브라우저로 복귀하면 재입력 없이
// 검증하고, 다른 기기(또는 저장 유실)면 이메일 재입력으로 처리한다(Firebase 권장 패턴).
const SIGNUP_EMAIL_LINK_STORAGE_KEY = "signup:email-for-link";

export type SignInEmailResult =
  | { ok: true }
  | { ok: false; reason: SignInFailureReason; message: string };

export type SignInFailureReason =
  | "invalid-credential"
  | "invalid-email"
  | "user-disabled"
  | "other";

export type SendPasswordResetResult = { ok: true } | { ok: false; message: string };

export type SendSignupEmailLinkResult =
  | { ok: true }
  | { ok: false; reason: SendSignupEmailLinkFailureReason; message: string };

export type SendSignupEmailLinkFailureReason =
  | "invalid-email"
  | "too-many-requests"
  | "not-configured"
  | "other";

export type CompleteSignupEmailLinkResult =
  | { ok: true }
  | {
      ok: false;
      reason: CompleteSignupEmailLinkFailureReason;
      message: string;
    };

export type CompleteSignupEmailLinkFailureReason =
  | "invalid-link"
  | "email-mismatch"
  | "user-disabled"
  | "other";

export type SetSignupPasswordResult =
  | { ok: true }
  | { ok: false; reason: SetSignupPasswordFailureReason; message: string };

export type SetSignupPasswordFailureReason =
  | "no-session"
  | "weak-password"
  | "requires-recent-login"
  | "other";

const GENERIC_AUTH_ERROR = "다시 시도해 주세요.";
const GENERIC_SIGNIN_ERROR = `로그인에 실패했습니다. ${GENERIC_AUTH_ERROR}`;
const GENERIC_SEND_LINK_ERROR = `인증 메일을 보내지 못했습니다. ${GENERIC_AUTH_ERROR}`;
const EXPIRED_LINK_MESSAGE =
  "인증 링크가 만료되었거나 이미 사용되었습니다. 인증 메일을 다시 받아 주세요.";
const WEAK_PASSWORD_MESSAGE =
  "비밀번호가 약합니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요.";
const GENERIC_PASSWORD_RESET_ERROR =
  "비밀번호 재설정 이메일을 보내지 못했습니다.";

// 가입 전 인증: 입력한 이메일로 로그인 링크를 발송한다. 성공 시 이메일을 localStorage에
// 보관해 링크 복귀 시 재입력 없이 검증한다(저장 실패는 다른 기기 복귀와 같은 경로로 처리).
export async function sendSignupEmailLink(
  email: string,
): Promise<SendSignupEmailLinkResult> {
  const { auth } = getFirebaseClient();
  try {
    await sendSignInLinkToEmail(auth, email, {
      url: `${window.location.origin}/signup`,
      handleCodeInApp: true,
    });
  } catch (error) {
    return { ok: false, ...mapSendSignupEmailLinkError(error) };
  }
  try {
    window.localStorage.setItem(SIGNUP_EMAIL_LINK_STORAGE_KEY, email);
  } catch {
    console.warn("[signup email link] failed to persist email for link");
  }
  return { ok: true };
}

export function getStoredSignupEmail(): string | null {
  try {
    return window.localStorage.getItem(SIGNUP_EMAIL_LINK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredSignupEmail() {
  try {
    window.localStorage.removeItem(SIGNUP_EMAIL_LINK_STORAGE_KEY);
  } catch {
    // 삭제 실패는 다음 발송에서 덮어쓰므로 무해.
  }
}

// 현재 URL이 이메일 인증 링크(mode=signIn) 복귀인지 판별한다.
export function isSignupEmailLink(url: string): boolean {
  try {
    const { auth } = getFirebaseClient();
    return isSignInWithEmailLink(auth, url);
  } catch {
    console.warn("[signup email link] firebase unavailable while checking link");
    return false;
  }
}

// 링크 복귀 검증: 이메일 소유가 확정되고, 이 시점 계정은 비밀번호 없는 상태로 로그인된다.
export async function completeSignupEmailLink(
  email: string,
  link: string,
): Promise<CompleteSignupEmailLinkResult> {
  const { auth } = getFirebaseClient();
  try {
    await signInWithEmailLink(auth, email, link);
  } catch (error) {
    return { ok: false, ...mapCompleteSignupEmailLinkError(error) };
  }
  clearStoredSignupEmail();
  return { ok: true };
}

// 링크 인증 후 위저드 정보 입력 단계에서 비밀번호를 설정한다.
export async function setSignupPassword(
  password: string,
): Promise<SetSignupPasswordResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "no-session",
      message: "가입 세션이 만료됐습니다. 처음부터 다시 시도해 주세요.",
    };
  }
  try {
    await updatePassword(user, password);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapSetSignupPasswordError(error) };
  }
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SignInEmailResult> {
  const { auth } = getFirebaseClient();
  try {
    await signInWithEmailAndPassword(auth, input.email, input.password);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapSignInError(error) };
  }
}

export async function sendPasswordReset(
  email: string,
): Promise<SendPasswordResetResult> {
  const { auth } = getFirebaseClient();
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch {
    // email enumeration 방어를 위해 generic 메시지로 응답을 통일하는 건 호출자가 결정.
    console.warn("[email reset] sendPasswordResetEmail failed");
    return { ok: false, message: GENERIC_PASSWORD_RESET_ERROR };
  }
}

function mapSendSignupEmailLinkError(error: unknown): {
  reason: SendSignupEmailLinkFailureReason;
  message: string;
} {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return {
        reason: "invalid-email",
        message: "이메일 형식이 올바르지 않습니다.",
      };
    case "auth/too-many-requests":
      return {
        reason: "too-many-requests",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      };
    // 콘솔 설정 누락(이메일 링크 로그인 미사용/미승인 도메인)은 사용자가 해결할 수 없으니
    // 재시도 안내 대신 명시적으로 구분해 보여준다(No Silent Fallback).
    case "auth/operation-not-allowed":
    case "auth/unauthorized-continue-uri":
      return {
        reason: "not-configured",
        message:
          "이메일 인증이 아직 활성화되지 않았습니다. 잠시 후에도 반복되면 관리자에게 문의해 주세요.",
      };
    default:
      return { reason: "other", message: GENERIC_SEND_LINK_ERROR };
  }
}

function mapCompleteSignupEmailLinkError(error: unknown): {
  reason: CompleteSignupEmailLinkFailureReason;
  message: string;
} {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return { reason: "invalid-link", message: EXPIRED_LINK_MESSAGE };
    // 다른 기기 복귀 등에서 재입력한 이메일이 링크를 받은 주소와 다른 경우.
    case "auth/invalid-email":
      return {
        reason: "email-mismatch",
        message: "인증 메일을 받은 이메일 주소와 다릅니다. 다시 확인해 주세요.",
      };
    case "auth/user-disabled":
      return {
        reason: "user-disabled",
        message: "비활성화된 계정입니다. 관리자에게 문의해 주세요.",
      };
    default:
      return {
        reason: "other",
        message: `이메일 인증에 실패했습니다. ${GENERIC_AUTH_ERROR}`,
      };
  }
}

function mapSetSignupPasswordError(error: unknown): {
  reason: SetSignupPasswordFailureReason;
  message: string;
} {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      // Firebase 프로젝트 비밀번호 정책(8자+/소문자/숫자/특수문자) 미충족.
      // 클라 검증이 안전망 역할을 하지만 정책 변경/우회 시 여기서 구체 안내한다.
      return { reason: "weak-password", message: WEAK_PASSWORD_MESSAGE };
    // 링크 인증 후 오래 지나 재개하면 최근 로그인 요건에 걸릴 수 있다 → 링크 재발급 유도.
    case "auth/requires-recent-login":
      return {
        reason: "requires-recent-login",
        message:
          "보안을 위해 이메일 인증이 다시 필요합니다. 처음 화면에서 인증 메일을 다시 받아 주세요.",
      };
    default:
      return {
        reason: "other",
        message: `비밀번호 설정에 실패했습니다. ${GENERIC_AUTH_ERROR}`,
      };
  }
}

function mapSignInError(error: unknown): {
  reason: SignInFailureReason;
  message: string;
} {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return {
        reason: "invalid-credential",
        message: "아이디 또는 비밀번호가 올바르지 않습니다.",
      };
    case "auth/invalid-email":
      return {
        reason: "invalid-email",
        message: "이메일 형식이 올바르지 않습니다.",
      };
    case "auth/user-disabled":
      return {
        reason: "user-disabled",
        message: "비활성화된 계정입니다. 관리자에게 문의해 주세요.",
      };
    default:
      return {
        reason: "other",
        message: GENERIC_SIGNIN_ERROR,
      };
  }
}
