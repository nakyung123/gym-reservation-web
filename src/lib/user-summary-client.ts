"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isUserSummary, type UserSummary } from "@/lib/user-summary";

export type FetchUserSummaryResult =
  | { ok: true; user: { uid: string }; summary: UserSummary }
  | {
      ok: false;
      kind: "auth-required" | "error";
      message: string;
      status?: number;
    };

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; kind: "auth-required" | "error"; message: string };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "알 수 없는 오류";
}

function isUser(value: unknown): value is { uid: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as { uid?: unknown }).uid === "string";
}

async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 정보가 없어 내 정보를 불러올 수 없습니다.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      message: `ID 토큰을 가져오지 못했습니다. ${getErrorMessage(error)}`,
    };
  }
}

export async function fetchUserSummary(
  signal?: AbortSignal,
): Promise<FetchUserSummaryResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token.idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message: `내 정보 요청에 실패했습니다. ${getErrorMessage(error)}`.trim(),
    };
  }

  let data: { user?: unknown; summary?: unknown; message?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "내 정보 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    isUser(data.user) &&
    isUserSummary(data.summary) &&
    data.user.uid === data.summary.userId
  ) {
    return {
      ok: true,
      user: data.user,
      summary: data.summary,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: "auth-required",
      message:
        typeof data.message === "string"
          ? data.message
          : "내 정보를 보려면 로그인 상태가 필요합니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `내 정보 조회 실패: status=${response.status}`,
    status: response.status,
  };
}
