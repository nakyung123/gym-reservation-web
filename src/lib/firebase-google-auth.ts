import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 익명 흐름 제거 후 Google 로그인은 일반 signInWithPopup만 사용한다.
// 익명 계정에 link하던 linkWithPopup 흐름과 credential-already-in-use 분기는 사라졌다.

export type SignInWithGoogleResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function signInWithGoogle(): Promise<SignInWithGoogleResult> {
  try {
    const { auth } = getFirebaseClient();
    const provider = new GoogleAuthProvider();
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

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Google 계정 로그인에 실패했습니다.";

    return { ok: false, cancelled: false, message };
  }
}
