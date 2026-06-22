import { isSport } from "@/lib/domain-constants";
import type { Sport } from "@/types/domain";

export type UserProfile = {
  userId: string;
  nickname: string | null;
  // provider는 서버가 산출하는 표시/통계 필드. 알려지지 않은 경우 null.
  provider: "local" | "google" | "kakao" | "naver" | null;
  // 회원정보변경에서 자체 입력받는 회원 정보(휴대폰 본인인증 없이 직접 입력).
  name: string | null;
  phone: string | null;
  // 생년월일은 YYYY-MM-DD 문자열로 저장한다(타임존 영향 없음).
  birthDate: string | null;
  address: string | null;
  // preferredRegion/preferredSports는 더 이상 UI에서 편집하지 않지만 기존 데이터/통계
  // 호환을 위해 읽기 모델에는 유지한다.
  preferredRegion: string | null;
  preferredSports: Sport[];
  reservationNotificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

// 회원정보변경에서 저장 가능한 필드만 입력 모델에 둔다.
// (닉네임은 가입 시 자동 생성·고정, 선호 지역/종목은 편집 대상에서 제외)
export type UserProfileInput = {
  name: string | null;
  phone: string | null;
  birthDate: string | null;
  address: string | null;
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

// 닉네임 최대 길이. nickname-availability API, random-nickname, 가입 흐름에서 공유한다.
export const NICKNAME_MAX_LENGTH = 8;
// 회원정보 필드 최대 길이(검증·UI maxLength·DB VarChar와 동일하게 맞춘다).
export const NAME_MAX_LENGTH = 30;
export const PHONE_MAX_LENGTH = 20;
export const ADDRESS_MAX_LENGTH = 200;

// 연락처: 숫자와 하이픈만 허용하고 하이픈을 뺀 숫자가 9자리 이상이어야 한다.
function parsePhone(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "연락처는 문자열 또는 null이어야 합니다." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > PHONE_MAX_LENGTH) {
    return {
      ok: false,
      message: `연락처는 ${PHONE_MAX_LENGTH}자 이하로 입력해야 합니다.`,
    };
  }
  const digits = trimmed.replace(/-/g, "");
  if (!/^[0-9]+(-[0-9]+)*$/.test(trimmed) || digits.length < 9) {
    return {
      ok: false,
      message: "연락처는 숫자와 하이픈(-)만, 숫자 9자리 이상이어야 합니다.",
    };
  }
  return { ok: true, value: trimmed };
}

// 생년월일: YYYY-MM-DD 형식 + 실제 달력상 유효 + 미래 금지 + 1900년 이후.
function parseBirthDate(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "생년월일은 문자열 또는 null이어야 합니다." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return { ok: false, message: "생년월일은 YYYY-MM-DD 형식이어야 합니다." };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!isRealDate || year < 1900) {
    return { ok: false, message: "올바른 생년월일이 아닙니다." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (date.getTime() > todayUtc) {
    return { ok: false, message: "생년월일은 오늘 이후일 수 없습니다." };
  }
  return { ok: true, value: trimmed };
}

export function validateUserProfileInput(
  body: unknown,
): UserProfileValidationResult {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 본문이 올바르지 않습니다." };
  }

  const name = parseNullableText(body.name, "이름", NAME_MAX_LENGTH);
  if (!name.ok) return { ok: false, message: name.message };

  const phone = parsePhone(body.phone);
  if (!phone.ok) return { ok: false, message: phone.message };

  const birthDate = parseBirthDate(body.birthDate);
  if (!birthDate.ok) return { ok: false, message: birthDate.message };

  const address = parseNullableText(body.address, "주소", ADDRESS_MAX_LENGTH);
  if (!address.ok) return { ok: false, message: address.message };

  if (typeof body.reservationNotificationsEnabled !== "boolean") {
    return {
      ok: false,
      message: "예약 알림 설정은 boolean이어야 합니다.",
    };
  }

  return {
    ok: true,
    input: {
      name: name.value,
      phone: phone.value,
      birthDate: birthDate.value,
      address: address.value,
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
    isNullableString(value.name) &&
    isNullableString(value.phone) &&
    isNullableString(value.birthDate) &&
    isNullableString(value.address) &&
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
