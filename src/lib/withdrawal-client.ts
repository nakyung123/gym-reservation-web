"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import type { WithdrawalInput } from "@/lib/withdrawal";

export type WithdrawAccountResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason:
        | "auth-required"
        | "active-reservation"
        | "auth-delete-failed"
        | "error";
      message: string;
      status?: number;
    };

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; reason: "auth-required" | "error"; message: string };

async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        reason: "auth-required",
        message: "로그인 후 다시 시도해 주세요.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

export async function withdrawAccount(
  input: WithdrawalInput,
): Promise<WithdrawAccountResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return {
      ok: false,
      reason: token.reason,
      message: token.message,
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/me/withdraw", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "회원 탈퇴 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { message?: unknown; reason?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "회원 탈퇴 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  const message = typeof data.message === "string" ? data.message : "";

  if (response.ok) {
    return { ok: true, message: message || "회원 탈퇴가 완료되었습니다." };
  }

  if (response.status === 409 && data.reason === "active-reservation") {
    return {
      ok: false,
      reason: "active-reservation",
      message:
        message ||
        "취소되지 않은 예약이 있어 탈퇴할 수 없습니다.",
      status: response.status,
    };
  }

  if (response.status === 502 && data.reason === "auth-delete-failed") {
    return {
      ok: false,
      reason: "auth-delete-failed",
      message:
        message ||
        "회원 정보는 삭제되었지만 인증 계정 정리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      status: response.status,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      reason: "auth-required",
      message: message || "로그인 상태가 만료되었습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    reason: "error",
    message: message || `회원 탈퇴 실패: status=${response.status}`,
    status: response.status,
  };
}
