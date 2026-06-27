import "server-only";

// Firebase Identity Toolkit REST로 이메일/비밀번호를 서버에서 검증한다.
// 아이디 로그인 흐름에서 비밀번호를 클라이언트에 노출하지 않고 서버에서만 확인하기 위해 쓴다.
// 성공 시 localId(uid)를 돌려준다. 실패(잘못된 비번/계정 없음/네트워크/설정)는 사유와 함께 ok:false.
// API 키는 클라이언트에도 노출되는 NEXT_PUBLIC_FIREBASE_API_KEY(공개값)를 그대로 사용한다.

const SIGN_IN_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

export type VerifyPasswordResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "invalid-credentials" | "config" | "network" };

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
