"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

// 프로필 사진 변경: data URL 또는 null로 PUT /api/me/profile-photo 호출.
// 파일 → data URL 변환은 fileToResizedDataUrl에서 처리.

export type UpdateProfilePhotoResult =
  | {
      ok: true;
      user: { uid: string };
      profile: UserProfile;
      message: string;
    }
  | {
      ok: false;
      kind: "auth-required" | "error";
      message: string;
      status?: number;
    };

const MAX_INPUT_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_INPUT_TYPES = new Set(["image/jpeg", "image/png"]);
const RESIZE_MAX_EDGE = 512;
const OUTPUT_QUALITY = 0.85;

export type FileToDataUrlResult =
  | { ok: true; dataUrl: string }
  | { ok: false; message: string };

// 파일 검증 → 이미지 로드 → 비율 유지하면서 최대 변 512px로 리사이즈 → JPEG data URL.
// 정사각형 crop은 하지 않는다 (요구사항). PNG 입력이어도 JPEG로 변환해 용량을 줄인다.
export async function fileToResizedDataUrl(
  file: File,
): Promise<FileToDataUrlResult> {
  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "JPG 또는 PNG 형식의 이미지만 사용할 수 있습니다.",
    };
  }
  if (file.size > MAX_INPUT_FILE_SIZE) {
    return {
      ok: false,
      message: "이미지 용량은 2MB 이하만 사용할 수 있습니다.",
    };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "이미지를 읽지 못했습니다. 다른 파일을 시도해 주세요." };
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > RESIZE_MAX_EDGE ? RESIZE_MAX_EDGE / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return { ok: false, message: "캔버스 컨텍스트를 만들지 못했습니다." };
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
    return { ok: false, message: "이미지 변환에 실패했습니다." };
  }
  return { ok: true, dataUrl };
}

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; kind: "auth-required" | "error"; message: string };

async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 후 다시 시도해 주세요.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      message:
        error instanceof Error && error.message
          ? `ID 토큰을 가져오지 못했습니다. ${error.message}`
          : "ID 토큰을 가져오지 못했습니다.",
    };
  }
}

export async function updateProfilePhoto(
  photoBase64: string | null,
  signal?: AbortSignal,
): Promise<UpdateProfilePhotoResult> {
  const token = await getIdToken();
  if (!token.ok) return token;

  let response: Response;
  try {
    response = await fetch("/api/me/profile-photo", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ photoBase64 }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      kind: "error",
      message:
        error instanceof Error && error.message
          ? `프로필 사진 변경 요청에 실패했습니다. ${error.message}`
          : "프로필 사진 변경 요청에 실패했습니다.",
    };
  }

  let data: { user?: unknown; profile?: unknown; message?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "프로필 사진 변경 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

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
          : "프로필 사진이 변경되었습니다.",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: "auth-required",
      message:
        typeof data.message === "string"
          ? data.message
          : "로그인 후 다시 시도해 주세요.",
      status: response.status,
    };
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `프로필 사진 변경 실패: status=${response.status}`,
    status: response.status,
  };
}

function isUser(value: unknown): value is { uid: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { uid?: unknown }).uid === "string"
  );
}
