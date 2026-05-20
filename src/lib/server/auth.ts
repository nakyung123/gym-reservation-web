import "server-only";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";

export type VerifyIdTokenResult =
  | { ok: true; uid: string; signInProvider: string }
  | { ok: false; status: 401; message: string };

export async function verifyIdTokenFromRequest(
  request: NextRequest,
): Promise<VerifyIdTokenResult> {
  const header =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      message: "Authorization 헤더가 없습니다.",
    };
  }

  const idToken = header.slice("bearer ".length).trim();
  if (!idToken) {
    return { ok: false, status: 401, message: "ID 토큰이 비어있습니다." };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    // firebase.sign_in_provider는 Firebase ID token에 항상 포함된다.
    // 예: "anonymous", "google.com", "password", "custom".
    const signInProvider =
      typeof decoded.firebase?.sign_in_provider === "string"
        ? decoded.firebase.sign_in_provider
        : "";
    return { ok: true, uid: decoded.uid, signInProvider };
  } catch {
    return {
      ok: false,
      status: 401,
      message: "ID 토큰 검증에 실패했습니다.",
    };
  }
}
