import "server-only";
import {
  validateBannerLinkUrl,
  validateBannerTitle,
  type BannerMetaInput,
} from "@/lib/admin/banner";

// 배너 생성/수정 라우트의 multipart/form-data 파싱 경계.
// 이미지 바이트는 readImageBytes, 나머지 메타는 parseBannerMeta로 검증한다.

export type BannerMetaParse =
  | { ok: true; meta: BannerMetaInput }
  | { ok: false; message: string };

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export function parseBannerMeta(form: FormData): BannerMetaParse {
  const link = validateBannerLinkUrl(form.get("linkUrl"));
  if (!link.ok) return link;

  const title = validateBannerTitle(form.get("title"));
  if (!title.ok) return title;

  let sortOrder = 0;
  const sortRaw = form.get("sortOrder");
  if (typeof sortRaw === "string" && sortRaw.trim() !== "") {
    const parsed = Number(sortRaw);
    if (!Number.isInteger(parsed)) {
      return { ok: false, message: "정렬 순서는 정수여야 합니다." };
    }
    sortOrder = parsed;
  }

  const isActive = form.get("isActive") === "true";

  let startsAt: string | null = null;
  const startsRaw = form.get("startsAt");
  if (typeof startsRaw === "string" && startsRaw.trim() !== "") {
    if (!isValidIsoDate(startsRaw)) {
      return { ok: false, message: "시작 시각 형식이 올바르지 않습니다." };
    }
    startsAt = new Date(startsRaw).toISOString();
  }

  let endsAt: string | null = null;
  const endsRaw = form.get("endsAt");
  if (typeof endsRaw === "string" && endsRaw.trim() !== "") {
    if (!isValidIsoDate(endsRaw)) {
      return { ok: false, message: "종료 시각 형식이 올바르지 않습니다." };
    }
    endsAt = new Date(endsRaw).toISOString();
  }

  if (startsAt && endsAt && startsAt > endsAt) {
    return { ok: false, message: "시작 시각은 종료 시각보다 이후일 수 없습니다." };
  }

  return {
    ok: true,
    meta: {
      linkUrl: link.value,
      title: title.value,
      sortOrder,
      isActive,
      startsAt,
      endsAt,
    },
  };
}

// 이미지 파일 바이트를 읽는다. 파일이 없거나 문자열(폼 텍스트)이면 null.
export async function readImageBytes(form: FormData): Promise<Uint8Array | null> {
  const file = form.get("image");
  if (!file || typeof file === "string") {
    return null;
  }
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}
