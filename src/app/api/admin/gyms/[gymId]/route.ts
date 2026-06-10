import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { validateAdminGymPayload } from "@/lib/admin/admin-gym-schema";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import { updateAdminGym } from "@/lib/server/db-gym-admin-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

function mutationStatusCode(status: string): number {
  if (status === "not-found") return 404;
  if (status === "conflict" || status === "duplicate") return 409;
  return 422;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ gymId: string }> },
) {
  const ipLimit = await checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateAdminGymPayload(body, { requireId: false });
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const { gymId } = await params;
  let result: Awaited<ReturnType<typeof updateAdminGym>>;
  try {
    result = await updateAdminGym(gymId, validation.input);
  } catch (error) {
    return serverErrorResponse(
      "시설 정보를 저장하지 못했습니다.",
      "Failed to update admin gym",
      error,
    );
  }
  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: mutationStatusCode(result.status) },
    );
  }

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.gymUpdate,
    targetType: "gym",
    targetId: result.gym.id,
    summary: `시설 수정: ${result.gym.name}`,
    metadata: { region: result.gym.region, isActive: result.gym.isActive },
  });

  return Response.json({ gym: result.gym, message: result.message });
}
