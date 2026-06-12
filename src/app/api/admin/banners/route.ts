import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { parseBannerMeta, readImageBytes } from "@/lib/server/banner-request";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import { createBanner, listBanners } from "@/lib/server/db-banner-repository";
import {
  deleteBannerImage,
  uploadBannerImage,
} from "@/lib/server/supabase-storage";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

async function enforceAdminApiIpLimit(request: NextRequest) {
  return checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let banners: Awaited<ReturnType<typeof listBanners>>;
  try {
    banners = await listBanners();
  } catch (error) {
    return serverErrorResponse(
      "배너 목록을 불러오지 못했습니다.",
      "Failed to list banners",
      error,
    );
  }
  return Response.json({ banners });
}

export async function POST(request: NextRequest) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { message: "요청이 multipart/form-data 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const bytes = await readImageBytes(form);
  if (!bytes) {
    return Response.json(
      { message: "배너 이미지 파일이 필요합니다." },
      { status: 400 },
    );
  }

  const metaParse = parseBannerMeta(form);
  if (!metaParse.ok) {
    return Response.json({ message: metaParse.message }, { status: 400 });
  }

  const uploaded = await uploadBannerImage(bytes);
  if (!uploaded.ok) {
    return Response.json({ message: uploaded.message }, { status: 400 });
  }

  let banner: Awaited<ReturnType<typeof createBanner>>;
  try {
    banner = await createBanner({
      imagePath: uploaded.path,
      meta: metaParse.meta,
    });
  } catch (error) {
    // 부분 실패 보상: DB insert 실패 시 업로드한 Storage 객체를 정리해 orphan을 막는다.
    await deleteBannerImage(uploaded.path).catch(() => {});
    return serverErrorResponse(
      "배너 생성에 실패했습니다.",
      "Failed to create banner",
      error,
    );
  }

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.bannerCreate,
    targetType: "banner",
    targetId: banner.id,
    summary: `배너 생성: ${banner.title ?? "(제목 없음)"}`,
    metadata: { isActive: banner.isActive, sortOrder: banner.sortOrder },
  });

  return Response.json({ banner }, { status: 201 });
}
