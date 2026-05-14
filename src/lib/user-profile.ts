import { isSport } from "@/lib/domain-constants";
import type { Sport } from "@/types/domain";

export type UserProfile = {
  userId: string;
  nickname: string | null;
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

  const nickname = parseNullableText(body.nickname, "닉네임", 30);
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
    isNullableString(value.preferredRegion) &&
    Array.isArray(value.preferredSports) &&
    value.preferredSports.every(isSport) &&
    typeof value.reservationNotificationsEnabled === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}
