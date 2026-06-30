import { FacebookAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// Facebook 로그인. google 흐름과 동일하게 signInWithPopup만 사용한다.
// 실제 동작에는 Firebase 콘솔에서 Facebook 공급자 활성화 + 앱ID/시크릿 등록이
// 필요하다. 미설정 상태에서는 auth/operation-not-allowed가 발생한다.

export type SignInWithFacebookResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function signInWithFacebook(): Promise<SignInWithFacebookResult> {
  try {
    const { auth } = getFirebaseClient();
    const provider = new FacebookAuthProvider();
    await signInWithPopup(auth, provider);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";

    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      return { ok: false, cancelled: true };
    }

    if (code === "auth/account-exists-with-different-credential") {
      return {
        ok: false,
        cancelled: false,
        message:
          "같은 이메일로 가입된 다른 로그인 방식이 있습니다. 다른 방식으로 로그인해 주세요.",
      };
    }

    if (code === "auth/operation-not-allowed") {
      return {
        ok: false,
        cancelled: false,
        message: "페이스북 로그인이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    return {
      ok: false,
      cancelled: false,
      message: "Facebook 계정 로그인에 실패했습니다. 다시 시도해 주세요.",
    };
  }
}
