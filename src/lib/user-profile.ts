import { isSport } from "@/lib/domain-constants";
import type { Sport } from "@/types/domain";

export type UserProfile = {
  userId: string;
  nickname: string | null;
  // loginId는 사용자가 가입 시 직접 정하는 로그인 식별자(아이디). 1회 설정 후 불변.
  // 미설정(기존 회원/소셜 직후) 시 null. 로그인 시 아이디→이메일 변환의 기준(SSOT)이다.
  loginId: string | null;
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

// 아이디(loginId) 규칙. 가입 폼·중복확인 API·설정 API·DB VarChar(20)가 모두 공유하는 SSOT.
export const LOGIN_ID_MIN_LENGTH = 4;
export const LOGIN_ID_MAX_LENGTH = 20;
export const LOGIN_ID_HINT =
  "영문 소문자로 시작하고, 영문 소문자·숫자·밑줄(_)만 4~20자.";
// 영문 소문자로 시작 + 영문 소문자/숫자/언더스코어, 총 4~20자.
// 대문자를 silent하게 소문자로 바꾸지 않고 명시적으로 거부한다(No Silent Fallback).
const LOGIN_ID_PATTERN = /^[a-z][a-z0-9_]{3,19}$/;

export type LoginIdValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

// 아이디 형식 검증. 성공 시 trim된 정규값을 돌려준다(대소문자 변환은 하지 않음).
export function validateLoginId(value: unknown): LoginIdValidationResult {
  if (typeof value !== "string") {
    return { ok: false, message: "아이디는 문자열이어야 합니다." };
  }
  const trimmed = value.trim();
  if (
    trimmed.length < LOGIN_ID_MIN_LENGTH ||
    trimmed.length > LOGIN_ID_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `아이디는 ${LOGIN_ID_MIN_LENGTH}~${LOGIN_ID_MAX_LENGTH}자여야 합니다.`,
    };
  }
  if (!LOGIN_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message:
        "아이디는 영문 소문자로 시작하고 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다.",
    };
  }
  return { ok: true, value: trimmed };
}

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
// 클라이언트 폼(회원가입)에서도 같은 규칙으로 사전 검증하도록 export한다(SSOT).
export function parseBirthDate(
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
    isNullableString(value.loginId) &&
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
