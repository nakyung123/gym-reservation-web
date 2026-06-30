import "server-only";

// Firebase Identity Toolkit REST로 이메일/비밀번호를 서버에서 검증한다.
// 아이디 로그인 흐름에서 비밀번호를 클라이언트에 노출하지 않고 서버에서만 확인하기 위해 쓴다.
// 성공 시 localId(uid)를 돌려준다. 실패(잘못된 비번/계정 없음/네트워크/설정)는 사유와 함께 ok:false.
// API 키는 클라이언트에도 노출되는 NEXT_PUBLIC_FIREBASE_API_KEY(공개값)를 그대로 사용한다.

const SIGN_IN_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const RESET_PASSWORD_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:resetPassword";

export type VerifyPasswordResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "invalid-credentials" | "config" | "network" };

export type VerifyResetCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid-code" | "config" | "network" };

// 비밀번호 재설정 oobCode를 서버에서 검증해 해당 코드가 가리키는 이메일을 돌려준다.
// newPassword 없이 oobCode만 보내면 코드 검증만 수행하고 email을 반환한다(코드를 소비하지 않으므로
// 클라이언트의 이후 confirmPasswordReset는 그대로 동작한다). 클라 검증만으로는 서버가 신뢰할 수
// 없으므로, "이메일로 아이디 조회" 같은 노출 흐름은 이 서버 검증을 본인 확인 근거로 써야 한다.
export async function verifyPasswordResetOobCode(
  oobCode: string,
): Promise<VerifyResetCodeResult> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "config" };
  }

  let response: Response;
  try {
    response = await fetch(`${RESET_PASSWORD_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // newPassword 미포함 = 검증 전용. 유효하면 { email, requestType: "PASSWORD_RESET" }.
      body: JSON.stringify({ oobCode }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    // 400 = INVALID_OOB_CODE / EXPIRED_OOB_CODE 등 → 노출 없이 무효 처리.
    return { ok: false, reason: "invalid-code" };
  }

  const data = (await response.json().catch(() => null)) as
    | { email?: unknown }
    | null;
  if (!data || typeof data.email !== "string" || data.email.length === 0) {
    return { ok: false, reason: "invalid-code" };
  }
  return { ok: true, email: data.email };
}

export async function verifyEmailPassword(
  email: string,
  password: string,
): Promise<VerifyPasswordResult> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "config" };
  }

  let response: Response;
  try {
    response = await fetch(`${SIGN_IN_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // returnSecureToken=false: 세션 토큰은 필요 없고 비밀번호 검증만 한다.
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    // 400 = INVALID_PASSWORD / EMAIL_NOT_FOUND / INVALID_LOGIN_CREDENTIALS 등.
    // enumeration 방지를 위해 사유를 하나로 묶는다.
    return { ok: false, reason: "invalid-credentials" };
  }

  const data = (await response.json().catch(() => null)) as
    | { localId?: unknown }
    | null;
  if (!data || typeof data.localId !== "string") {
    return { ok: false, reason: "network" };
  }
  return { ok: true, uid: data.localId };
}
