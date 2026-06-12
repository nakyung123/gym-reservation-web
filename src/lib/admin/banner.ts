// 운영 배너의 client-safe 타입·검증·상수(SSOT).
// 이미지 public URL은 서버가 imagePath에서 파생해 imageUrl로 내려준다 — imagePath/SERVICE_ROLE 같은
// 서버 비밀은 이 타입에 포함되지 않는다. 서버 전용 의존이 없어 클라이언트 번들에도 안전하다.

export const BANNER_TITLE_MAX_LENGTH = 200;
export const BANNER_LINK_URL_MAX_LENGTH = 2000;

// 관리자 화면용 전체 배너 형태(JSON 경계, 날짜는 ISO 문자열).
export type Banner = {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// 홈(공개) 노출용 최소 형태. 운영 메타(활성여부·기간·정렬)는 서버 필터링 후라 내려보내지 않는다.
export type PublicBanner = {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
};

// 생성/수정 메타 입력(이미지 바이트는 multipart로 별도 전송).
export type BannerMetaInput = {
  linkUrl: string | null;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

// linkUrl은 http/https만 허용한다(스킴 인젝션 방지).
export function isValidBannerLinkUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export type BannerLinkUrlValidation =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

export function validateBannerLinkUrl(value: unknown): BannerLinkUrlValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "링크 URL 형식이 올바르지 않습니다." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > BANNER_LINK_URL_MAX_LENGTH) {
    return {
      ok: false,
      message: `링크 URL은 ${BANNER_LINK_URL_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  if (!isValidBannerLinkUrl(trimmed)) {
    return { ok: false, message: "링크 URL은 http/https만 허용됩니다." };
  }
  return { ok: true, value: trimmed };
}

export type BannerTitleValidation =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

export function validateBannerTitle(value: unknown): BannerTitleValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "제목 형식이 올바르지 않습니다." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > BANNER_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      message: `제목은 ${BANNER_TITLE_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  return { ok: true, value: trimmed };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isBanner(value: unknown): value is Banner {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.imageUrl === "string" &&
    isStringOrNull(value.linkUrl) &&
    isStringOrNull(value.title) &&
    typeof value.sortOrder === "number" &&
    typeof value.isActive === "boolean" &&
    isStringOrNull(value.startsAt) &&
    isStringOrNull(value.endsAt) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isPublicBanner(value: unknown): value is PublicBanner {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.imageUrl === "string" &&
    isStringOrNull(value.linkUrl) &&
    isStringOrNull(value.title)
  );
}
