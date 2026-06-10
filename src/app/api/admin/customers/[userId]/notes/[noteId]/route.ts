import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import { deleteUserNote } from "@/lib/server/db-user-note-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; noteId: string }> },
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

  const { userId, noteId } = await params;

  let result: Awaited<ReturnType<typeof deleteUserNote>>;
  try {
    result = await deleteUserNote(noteId, userId);
  } catch (error) {
    return serverErrorResponse(
      "고객 메모를 삭제하지 못했습니다.",
      "Failed to delete customer note",
      error,
    );
  }

  if (!result.ok) {
    return Response.json(
      { message: "삭제할 메모를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.customerNoteDelete,
    targetType: "user",
    targetId: userId,
    summary: "고객 메모 삭제",
    metadata: { noteId },
  });

  return Response.json({ ok: true });
}
