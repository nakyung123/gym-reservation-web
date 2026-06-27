import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 아이디(loginId) + 비밀번호 로그인 클라이언트 helper.
// 서버(/api/auth/login-id)가 비밀번호를 검증하고 customToken을 발급하면
// signInWithCustomToken으로 세션을 수립한다. 이메일은 클라이언트로 오지 않는다.

export type SignInLoginIdResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signInWithLoginId(input: {
  loginId: string;
  password: string;
}): Promise<SignInLoginIdResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginId: input.loginId.trim(),
        password: input.password,
      }),
    });
  } catch {
    return { ok: false, message: "로그인 요청에 실패했습니다. 다시 시도해 주세요." };
  }

  const body = (await response.json().catch(() => null)) as
    | { customToken?: string; message?: unknown }
    | null;

  if (!response.ok || !body?.customToken) {
    return {
      ok: false,
      message:
        typeof body?.message === "string"
          ? body.message
          : "아이디 또는 비밀번호가 올바르지 않습니다.",
    };
  }

  const { auth } = getFirebaseClient();
  try {
    await signInWithCustomToken(auth, body.customToken);
  } catch {
    return {
      ok: false,
      message: "로그인에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  return { ok: true };
}
