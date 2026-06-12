import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { parseBannerMeta, readImageBytes } from "@/lib/server/banner-request";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import {
  deleteBanner,
  getBannerImagePath,
  updateBanner,
} from "@/lib/server/db-banner-repository";
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { bannerId } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { message: "요청이 multipart/form-data 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const metaParse = parseBannerMeta(form);
  if (!metaParse.ok) {
    return Response.json({ message: metaParse.message }, { status: 400 });
  }

  // 이미지가 함께 오면 교체한다. 없으면 메타만 수정.
  const bytes = await readImageBytes(form);
  let newImagePath: string | undefined;
  let oldImagePath: string | null = null;
  if (bytes) {
    // 교체 전 기존 객체 경로를 확보한다(업데이트 성공 후 밀려난 객체 정리에 사용).
    // 읽기 실패는 정리를 건너뛸 뿐 교체 자체를 막지 않는다(best-effort).
    oldImagePath = await getBannerImagePath(bannerId).catch(() => null);
    const uploaded = await uploadBannerImage(bytes);
    if (!uploaded.ok) {
      return Response.json({ message: uploaded.message }, { status: 400 });
    }
    newImagePath = uploaded.path;
  }

  let updated: Awaited<ReturnType<typeof updateBanner>>;
  try {
    updated = await updateBanner(bannerId, {
      meta: metaParse.meta,
      imagePath: newImagePath,
    });
  } catch (error) {
    // 부분 실패 보상: 새로 올린 이미지가 있으면 정리(orphan 방지).
    if (newImagePath) {
      await deleteBannerImage(newImagePath).catch(() => {});
    }
    return serverErrorResponse(
      "배너 수정에 실패했습니다.",
      "Failed to update banner",
      error,
    );
  }

  if (!updated) {
    // 대상이 없으면 방금 올린 이미지는 orphan이므로 정리.
    if (newImagePath) {
      await deleteBannerImage(newImagePath).catch(() => {});
    }
    return Response.json(
      { message: "배너를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 이미지를 교체했으면 밀려난 기존 Storage 객체를 정리한다(orphan 방지, best-effort).
  // 정리 실패는 본 수정을 깨지 않는다(DELETE의 Storage 정리와 동일 정책).
  if (newImagePath && oldImagePath && oldImagePath !== newImagePath) {
    await deleteBannerImage(oldImagePath).catch(() => {});
  }

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.bannerUpdate,
    targetType: "banner",
    targetId: updated.id,
    summary: `배너 수정: ${updated.title ?? "(제목 없음)"}`,
    metadata: {
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      imageReplaced: Boolean(newImagePath),
    },
  });

  return Response.json({ banner: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { bannerId } = await params;

  let removed: Awaited<ReturnType<typeof deleteBanner>>;
  try {
    removed = await deleteBanner(bannerId);
  } catch (error) {
    return serverErrorResponse(
      "배너 삭제에 실패했습니다.",
      "Failed to delete banner",
      error,
    );
  }

  if (!removed) {
    return Response.json(
      { message: "배너를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // DB 삭제 성공 후 Storage 객체 정리. 객체 삭제 실패는 본 삭제를 깨지 않는다(best-effort).
  await deleteBannerImage(removed.imagePath).catch(() => {});

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.bannerDelete,
    targetType: "banner",
    targetId: bannerId,
    summary: `배너 삭제: ${bannerId}`,
  });

  return Response.json({ ok: true });
}
