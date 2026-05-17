"use client";

import { getFirebaseClient } from "@/lib/firebase-client";

export type NicknameAvailabilityResult =
  | { ok: true; available: true }
  | { ok: true; available: false; reason: "taken" | "invalid" }
  | { ok: false; message: string };

// 닉네임 사용 가능 여부 조회. 가입 폼에서도 호출하므로 인증이 없어도 동작한다.
// 인증된 사용자의 본인 닉네임은 server가 사용 가능으로 처리한다.
export async function checkNicknameAvailability(
  nickname: string,
  signal?: AbortSignal,
): Promise<NicknameAvailabilityResult> {
  const trimmed = nickname.trim();
  if (!trimmed) {
    return { ok: true, available: false, reason: "invalid" };
  }

  let idToken: string | null = null;
  try {
    const { auth } = getFirebaseClient();
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
  } catch {
    idToken = null;
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/me/nickname-availability?nickname=${encodeURIComponent(trimmed)}`,
      {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { ok: false, message: "닉네임 조회 요청에 실패했습니다." };
  }

  if (!response.ok) {
    return { ok: false, message: `닉네임 조회 실패 (status=${response.status})` };
  }

  const body = (await response.json().catch(() => null)) as
    | { available?: boolean; reason?: string }
    | null;

  if (body?.available === true) return { ok: true, available: true };
  if (body?.available === false) {
    const reason = body.reason === "invalid" ? "invalid" : "taken";
    return { ok: true, available: false, reason };
  }
  return { ok: false, message: "닉네임 조회 응답이 올바르지 않습니다." };
}
