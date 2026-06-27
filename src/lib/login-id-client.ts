"use client";

import { getFirebaseClient } from "@/lib/firebase-client";

export type LoginIdAvailabilityResult =
  | { ok: true; available: true }
  | { ok: true; available: false; reason: "taken" | "invalid" }
  | { ok: false; message: string };

// 아이디 사용 가능 여부 조회. 가입 폼에서도 호출하므로 인증이 없어도 동작한다.
// 인증된 사용자의 본인 아이디는 server가 사용 가능으로 처리한다.
export async function checkLoginIdAvailability(
  loginId: string,
  signal?: AbortSignal,
): Promise<LoginIdAvailabilityResult> {
  const trimmed = loginId.trim();
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
      `/api/me/login-id-availability?loginId=${encodeURIComponent(trimmed)}`,
      {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { ok: false, message: "아이디 조회 요청에 실패했습니다." };
  }

  const body = (await response.json().catch(() => null)) as
    | { available?: boolean; reason?: string; message?: unknown }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof body?.message === "string"
          ? body.message
          : `아이디 조회 실패 (status=${response.status})`,
    };
  }

  if (body?.available === true) return { ok: true, available: true };
  if (body?.available === false) {
    const reason = body.reason === "invalid" ? "invalid" : "taken";
    return { ok: true, available: false, reason };
  }
  return { ok: false, message: "아이디 조회 응답이 올바르지 않습니다." };
}

export type SetLoginIdResult = { ok: true } | { ok: false; message: string };

// 아이디를 1회 설정한다(가입 마지막 단계). 인증 필요. 이미 설정/선점 시 실패 메시지 반환.
export async function setLoginId(loginId: string): Promise<SetLoginIdResult> {
  let idToken: string;
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return { ok: false, message: "로그인 상태가 아니어서 아이디를 설정할 수 없습니다." };
    }
    idToken = await auth.currentUser.getIdToken();
  } catch {
    return { ok: false, message: "로그인 인증 정보를 확인하지 못했습니다." };
  }

  let response: Response;
  try {
    response = await fetch("/api/me/login-id", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ loginId: loginId.trim() }),
    });
  } catch {
    return { ok: false, message: "아이디 설정 요청에 실패했습니다. 다시 시도해 주세요." };
  }

  if (response.ok) {
    return { ok: true };
  }

  const body = (await response.json().catch(() => null)) as
    | { message?: unknown }
    | null;
  return {
    ok: false,
    message:
      typeof body?.message === "string"
        ? body.message
        : `아이디 설정 실패 (status=${response.status})`,
  };
}
