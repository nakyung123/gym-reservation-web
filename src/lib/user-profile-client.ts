"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import {
  isUserProfile,
  validateUserProfileInput,
  type UserProfile,
  type UserProfileInput,
} from "@/lib/user-profile";

export type FetchUserProfileResult =
  | { ok: true; user: { uid: string }; profile: UserProfile | null }
  | UserProfileClientFailure;

export type SaveUserProfileResult =
  | {
      ok: true;
      user: { uid: string };
      profile: UserProfile;
      message: string;
    }
  | UserProfileClientFailure;

type UserProfileClientFailure = {
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
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { uid?: unknown }).uid === "string"
  );
}

function isProfileOrNull(value: unknown): value is UserProfile | null {
  return value === null || isUserProfile(value);
}

async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 정보가 없어 프로필 설정을 불러올 수 없습니다.",
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

function authError(
  data: { message?: unknown },
  status: number,
): UserProfileClientFailure {
  return {
    ok: false,
    kind: "auth-required",
    message:
      typeof data.message === "string"
        ? data.message
        : "프로필 설정을 보려면 로그인 상태가 필요합니다.",
    status,
  };
}

async function readJsonResponse(
  response: Response,
): Promise<
  | {
      ok: true;
      data: {
        user?: unknown;
        profile?: unknown;
        message?: unknown;
      };
    }
  | { ok: false; message: string; status: number }
> {
  try {
    return {
      ok: true,
      data: (await response.json()) as {
        user?: unknown;
        profile?: unknown;
        message?: unknown;
      },
    };
  } catch {
    return {
      ok: false,
      message: "프로필 설정 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }
}

export async function fetchUserProfile(
  signal?: AbortSignal,
): Promise<FetchUserProfileResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch("/api/me/profile", {
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
      message:
        `프로필 설정 요청에 실패했습니다. ${getErrorMessage(error)}`.trim(),
    };
  }

  const json = await readJsonResponse(response);
  if (!json.ok) {
    return {
      ok: false,
      kind: "error",
      message: json.message,
      status: json.status,
    };
  }
  const { data } = json;

  if (
    response.ok &&
    isUser(data.user) &&
    isProfileOrNull(data.profile) &&
    (data.profile === null || data.profile.userId === data.user.uid)
  ) {
    return {
      ok: true,
      user: data.user,
      profile: data.profile,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return authError(data, response.status);
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `프로필 설정 조회 실패: status=${response.status}`,
    status: response.status,
  };
}

export async function saveUserProfile(
  input: UserProfileInput,
  signal?: AbortSignal,
): Promise<SaveUserProfileResult> {
  const validation = validateUserProfileInput(input);
  if (!validation.ok) {
    return { ok: false, kind: "error", message: validation.message };
  }

  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch("/api/me/profile", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validation.input),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message:
        `프로필 설정 저장 요청에 실패했습니다. ${getErrorMessage(error)}`.trim(),
    };
  }

  const json = await readJsonResponse(response);
  if (!json.ok) {
    return {
      ok: false,
      kind: "error",
      message: json.message,
      status: json.status,
    };
  }
  const { data } = json;

  if (
    response.ok &&
    isUser(data.user) &&
    isUserProfile(data.profile) &&
    data.profile.userId === data.user.uid
  ) {
    return {
      ok: true,
      user: data.user,
      profile: data.profile,
      message:
        typeof data.message === "string"
          ? data.message
          : "프로필 설정이 저장되었습니다.",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return authError(data, response.status);
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `프로필 설정 저장 실패: status=${response.status}`,
    status: response.status,
  };
}
