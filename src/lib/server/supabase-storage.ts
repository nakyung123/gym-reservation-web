import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase는 이 프로젝트에서 **Storage 용도로만** 쓴다. 인증은 Firebase Auth를 유지하며
// Supabase Auth는 사용하지 않는다(혼동 방지).
//
// SUPABASE_SERVICE_ROLE_KEY는 서버 전용 비밀이다. 이 파일은 server-only 경계에 있어
// 클라이언트 번들에 포함될 수 없다(src/lib/server/AGENTS.md). 키 원문은 로그/응답에 노출하지 않는다.
//
// 업로드는 "서버 경유"다: route가 받은 바이트를 여기서 매직바이트로 검증한 뒤 Storage에 올린다.
// (signed-URL 직접 업로드는 서버가 바이트를 못 봐 검증 불가라 채택하지 않음.)

const BANNERS_BUCKET = "banners";

// 배너 이미지 상한. 무료 티어/대역폭을 고려한 보수적 값.
const MAX_IMAGE_BYTES = 3_000_000; // 3MB

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // No silent fallback: 환경변수 누락은 명시적으로 throw.
    throw new Error(
      "[supabase-storage] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.",
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// 공개 버킷의 객체 public URL을 결정적으로 구성한다(path가 SSOT, URL은 파생).
export function bannerPublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error(
      "[supabase-storage] NEXT_PUBLIC_SUPABASE_URL이 설정되어 있지 않습니다.",
    );
  }
  return `${base}/storage/v1/object/public/${BANNERS_BUCKET}/${path}`;
}

// 확장자·Content-Type을 신뢰하지 않고 실제 바이트(매직바이트)로 이미지 종류를 판별한다.
function detectImageType(
  bytes: Uint8Array,
): { contentType: string; ext: string } | null {
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  // WebP: "RIFF"(52 49 46 46) .... "WEBP"(57 45 42 50)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

export type BannerUploadResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

// 바이트를 검증하고 banners 버킷에 uuid 경로로 업로드한다. 성공 시 저장용 path를 돌려준다.
export async function uploadBannerImage(
  bytes: Uint8Array,
): Promise<BannerUploadResult> {
  if (bytes.length === 0) {
    return { ok: false, message: "빈 파일입니다." };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: "이미지는 3MB 이하여야 합니다." };
  }

  const detected = detectImageType(bytes);
  if (!detected) {
    return {
      ok: false,
      message: "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
    };
  }

  const path = `${randomUUID()}.${detected.ext}`;

  const { error } = await getServiceClient()
    .storage.from(BANNERS_BUCKET)
    .upload(path, bytes, {
      contentType: detected.contentType,
      upsert: false,
    });

  if (error) {
    // 비밀/내부 사유는 노출하지 않고 일반 메시지로 응답한다.
    return { ok: false, message: "이미지 업로드에 실패했습니다." };
  }

  return { ok: true, path };
}

// 배너 삭제·부분 실패 보상(orphan 정리)에서 객체를 제거한다. best-effort.
export async function deleteBannerImage(path: string): Promise<void> {
  await getServiceClient().storage.from(BANNERS_BUCKET).remove([path]);
}
