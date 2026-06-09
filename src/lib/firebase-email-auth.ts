import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 자체 이메일/비밀번호 회원가입/로그인/재설정 helper.
// Firebase Auth Email/Password 기반.

export type SignupEmailResult =
  | { ok: true; emailVerificationSent: boolean }
  | { ok: false; reason: SignupFailureReason; message: string };

export type SignupFailureReason =
  | "email-in-use"
  | "invalid-email"
  | "weak-password"
  | "other";

export type SignInEmailResult =
  | { ok: true }
  | { ok: false; reason: SignInFailureReason; message: string };

export type SignInFailureReason =
  | "invalid-credential"
  | "invalid-email"
  | "user-disabled"
  | "other";

export type SendPasswordResetResult = { ok: true } | { ok: false; message: string };

export type SendEmailVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

const GENERIC_AUTH_ERROR = "다시 시도해 주세요.";
const GENERIC_SIGNUP_ERROR = `회원가입에 실패했습니다. ${GENERIC_AUTH_ERROR}`;
const GENERIC_SIGNIN_ERROR = `로그인에 실패했습니다. ${GENERIC_AUTH_ERROR}`;
const GENERIC_PASSWORD_RESET_ERROR =
  "비밀번호 재설정 이메일을 보내지 못했습니다.";
const GENERIC_EMAIL_VERIFICATION_ERROR =
  "이메일 인증 메일을 다시 보내지 못했습니다.";

export async function signupWithEmail(input: {
  email: string;
  password: string;
}): Promise<SignupEmailResult> {
  const { auth } = getFirebaseClient();
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      input.email,
      input.password,
    );
    // 닉네임은 서버에서 자동 생성한다 (ensureUserProfile). Firebase displayName은 사용하지 않는다.

    let emailVerificationSent = false;
    try {
      await sendEmailVerification(credential.user);
      emailVerificationSent = true;
    } catch {
      console.warn("[email signup] sendEmailVerification failed");
    }

    return { ok: true, emailVerificationSent };
  } catch (error) {
    return { ok: false, ...mapSignupError(error) };
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

export async function resendEmailVerification(): Promise<SendEmailVerificationResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, message: "로그인 후 이메일 인증을 재전송할 수 있습니다." };
  }
  try {
    await sendEmailVerification(user);
    return { ok: true };
  } catch {
    console.warn("[email verification] sendEmailVerification failed");
    return { ok: false, message: GENERIC_EMAIL_VERIFICATION_ERROR };
  }
}

// email enumeration 방어: "auth/email-already-in-use"는 가입 가능 여부 자체를 노출하므로
// 회원가입 UI에는 generic 메시지로 통일한다. 형식/약한 비밀번호 같은 입력 검증성 오류는
// 사용자 본인이 입력한 값이라 enumeration과 무관해 구체적으로 안내한다.
function mapSignupError(error: unknown): {
  reason: SignupFailureReason;
  message: string;
} {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return {
        reason: "email-in-use",
        message:
          "이 이메일로 가입할 수 없습니다. 이미 사용 중이라면 로그인 또는 비밀번호 재설정을 시도해 주세요.",
      };
    case "auth/invalid-email":
      return {
        reason: "invalid-email",
        message: "이메일 형식이 올바르지 않습니다.",
      };
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      // Firebase 프로젝트 비밀번호 정책(8자+/소문자/숫자/특수문자) 미충족.
      // 클라 검증이 안전망 역할을 하지만 정책 변경/우회 시 여기서 구체 안내한다.
      return {
        reason: "weak-password",
        message:
          "비밀번호가 정책을 충족하지 않습니다. 8자 이상이며 영문 소문자·숫자·특수문자를 포함해 주세요.",
      };
    default:
      return {
        reason: "other",
        message: GENERIC_SIGNUP_ERROR,
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
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
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
