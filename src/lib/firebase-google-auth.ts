import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

export type LinkGoogleAccountResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | {
      ok: false;
      cancelled: false;
      reason: "credential-already-in-use";
      message: string;
    }
  | {
      ok: false;
      cancelled: false;
      reason: "other";
      message: string;
    };

export type SignInWithGoogleResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function linkGoogleAccount(): Promise<LinkGoogleAccountResult> {
  const { auth } = getFirebaseClient();
  const provider = new GoogleAuthProvider();
  const { currentUser } = auth;

  try {
    if (!currentUser) {
      return {
        ok: false,
        cancelled: false,
        reason: "other",
        message:
          "로그인 세션이 없습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
      };
    }

    if (!currentUser.isAnonymous) {
      return {
        ok: false,
        cancelled: false,
        reason: "other",
        message: "이미 정식 계정으로 로그인되어 있습니다.",
      };
    }

    await linkWithPopup(currentUser, provider);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";

    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      return { ok: false, cancelled: true };
    }

    if (code === "auth/credential-already-in-use") {
      return {
        ok: false,
        cancelled: false,
        reason: "credential-already-in-use",
        message:
          "이 Google 계정은 이미 다른 계정에 연결되어 있습니다. 기존 계정으로 로그인할 수 있습니다.",
      };
    }

    if (code === "auth/provider-already-linked") {
      return {
        ok: false,
        cancelled: false,
        reason: "other",
        message: "이미 Google 계정이 연결되어 있습니다.",
      };
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Google 계정 연결에 실패했습니다.";

    return { ok: false, cancelled: false, reason: "other", message };
  }
}

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

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Google 계정 로그인에 실패했습니다.";

    return { ok: false, cancelled: false, message };
  }
}
