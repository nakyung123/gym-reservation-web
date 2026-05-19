import { isSport } from "@/lib/domain-constants";
import type { Sport } from "@/types/domain";

export type UserProfile = {
  userId: string;
  nickname: string | null;
  // provider는 서버가 산출하는 표시/통계 필드. 알려지지 않은 경우 null.
  provider: "local" | "google" | "kakao" | "naver" | null;
  // 사용자가 업로드한 프로필 사진을 data URL(data:image/jpeg;base64,...) 형식으로 저장.
  // null이면 기본 이미지 표시. 클라이언트에서 512px 이내로 리사이즈해 업로드.
  photoBase64: string | null;
  preferredRegion: string | null;
  preferredSports: Sport[];
  reservationNotificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserProfileInput = {
  nickname: string | null;
  preferredRegion: string | null;
  preferredSports: Sport[];
  reservationNotificationsEnabled: boolean;
};

// 프로필 사진은 닉네임/지역 등과 다른 흐름(업로드/삭제 즉시 반영)이라 별도 input 타입.
export type ProfilePhotoInput = {
  photoBase64: string | null;
};

// data URL 최대 길이. 512px JPEG 0.85 품질 기준 보통 30~80KB.
// base64 인코딩(원본의 약 1.37배) + 약간의 여유. 150KB ≈ 200,000자.
const MAX_PHOTO_BASE64_LENGTH = 200_000;
// data URL prefix + base64 payload(영문/숫자/+//=) 형식까지 모두 검증한다.
// 깨진 base64 문자(공백, 한글 등)가 섞이면 거부한다.
const PHOTO_DATA_URL_PATTERN =
  /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
// 각 매직 바이트의 base64 prefix(이미지 1바이트 이상이라 prefix만 일치하면 충분).
//   JPEG (FFD8FF) → "/9j/"
//   PNG  (89 50 4E 47) → "iVBORw0KGgo"
const JPEG_MAGIC_BASE64_PREFIX = "/9j/";
const PNG_MAGIC_BASE64_PREFIX = "iVBORw0KGgo";

export type ProfilePhotoValidationResult =
  | { ok: true; input: ProfilePhotoInput }
  | { ok: false; message: string };

export function validateProfilePhotoInput(
  body: unknown,
): ProfilePhotoValidationResult {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 본문이 올바르지 않습니다." };
  }
  const value = body.photoBase64;
  if (value === null) {
    return { ok: true, input: { photoBase64: null } };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      message: "프로필 사진은 문자열 또는 null이어야 합니다.",
    };
  }
  if (value.length > MAX_PHOTO_BASE64_LENGTH) {
    return {
      ok: false,
      message: "프로필 사진의 용량이 너무 큽니다. 더 작은 이미지를 사용해 주세요.",
    };
  }
  const match = PHOTO_DATA_URL_PATTERN.exec(value);
  if (!match) {
    return {
      ok: false,
      message: "프로필 사진은 JPEG 또는 PNG data URL 형식이어야 합니다.",
    };
  }
  const [, mime, payload] = match;
  // base64 padding 규칙: 전체 길이는 4의 배수여야 한다.
  if (payload.length % 4 !== 0) {
    return {
      ok: false,
      message: "프로필 사진 데이터가 손상되었습니다. 다시 시도해 주세요.",
    };
  }
  // 매직 바이트로 mime와 실제 이미지가 일치하는지 1차 확인. prefix 위변조 차단.
  const expectedPrefix =
    mime === "jpeg" ? JPEG_MAGIC_BASE64_PREFIX : PNG_MAGIC_BASE64_PREFIX;
  if (!payload.startsWith(expectedPrefix)) {
    return {
      ok: false,
      message: "프로필 사진이 실제 JPEG/PNG 이미지가 아닙니다.",
    };
  }
  return { ok: true, input: { photoBase64: value } };
}

export type UserProfileValidationResult =
  | { ok: true; input: UserProfileInput }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseNullableText(
  value: unknown,
  fieldLabel: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message: `${fieldLabel}은 문자열 또는 null이어야 합니다.`,
    };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  if (trimmed.length > max) {
    return {
      ok: false,
      message: `${fieldLabel}은 ${max}자 이하로 입력해야 합니다.`,
    };
  }

  return { ok: true, value: trimmed };
}

// 닉네임 최대 길이. validateUserProfileInput, nickname-availability API, UI 모두 동일하게 사용.
export const NICKNAME_MAX_LENGTH = 8;

function parsePreferredSports(
  value: unknown,
): { ok: true; sports: Sport[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: "선호 종목은 배열이어야 합니다." };
  }

  const sports: Sport[] = [];
  for (const item of value) {
    if (!isSport(item)) {
      return {
        ok: false,
        message: `지원하지 않는 선호 종목입니다: ${String(item)}`,
      };
    }
    if (!sports.includes(item)) {
      sports.push(item);
    }
  }

  return { ok: true, sports };
}

export function validateUserProfileInput(
  body: unknown,
): UserProfileValidationResult {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 본문이 올바르지 않습니다." };
  }

  const nickname = parseNullableText(body.nickname, "닉네임", NICKNAME_MAX_LENGTH);
  if (!nickname.ok) return { ok: false, message: nickname.message };

  const preferredRegion = parseNullableText(
    body.preferredRegion,
    "선호 지역",
    100,
  );
  if (!preferredRegion.ok) {
    return { ok: false, message: preferredRegion.message };
  }

  const preferredSports = parsePreferredSports(body.preferredSports);
  if (!preferredSports.ok) {
    return { ok: false, message: preferredSports.message };
  }

  if (typeof body.reservationNotificationsEnabled !== "boolean") {
    return {
      ok: false,
      message: "예약 알림 설정은 boolean이어야 합니다.",
    };
  }

  return {
    ok: true,
    input: {
      nickname: nickname.value,
      preferredRegion: preferredRegion.value,
      preferredSports: preferredSports.sports,
      reservationNotificationsEnabled: body.reservationNotificationsEnabled,
    },
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.userId === "string" &&
    isNullableString(value.nickname) &&
    isProviderId(value.provider) &&
    isNullableString(value.photoBase64) &&
    isNullableString(value.preferredRegion) &&
    Array.isArray(value.preferredSports) &&
    value.preferredSports.every(isSport) &&
    typeof value.reservationNotificationsEnabled === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isProviderId(value: unknown): value is UserProfile["provider"] {
  return (
    value === null ||
    value === "local" ||
    value === "google" ||
    value === "kakao" ||
    value === "naver"
  );
}
