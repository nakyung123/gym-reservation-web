import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { validateCustomerNoteBody } from "@/lib/admin/customer-note";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import {
  createUserNote,
  listUserNotes,
} from "@/lib/server/db-user-note-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

async function enforceAdminApiIpLimit(request: NextRequest) {
  return checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { userId } = await params;

  let notes: Awaited<ReturnType<typeof listUserNotes>>;
  try {
    notes = await listUserNotes(userId);
  } catch (error) {
    return serverErrorResponse(
      "고객 메모를 불러오지 못했습니다.",
      "Failed to list customer notes",
      error,
    );
  }

  return Response.json({ notes });
}

type CreateNoteBody = {
  body?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: CreateNoteBody;
  try {
    body = (await request.json()) as CreateNoteBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateCustomerNoteBody(body.body);
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const { userId } = await params;

  let note: Awaited<ReturnType<typeof createUserNote>>;
  try {
    note = await createUserNote({
      userId,
      adminUid: auth.uid,
      body: validation.body,
    });
  } catch (error) {
    return serverErrorResponse(
      "고객 메모를 저장하지 못했습니다.",
      "Failed to create customer note",
      error,
    );
  }

  // 메모 본문은 PII가 될 수 있어 audit summary/metadata에 담지 않는다. noteId만 남긴다.
  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.customerNoteCreate,
    targetType: "user",
    targetId: userId,
    summary: "고객 메모 추가",
    metadata: { noteId: note.id },
  });

  return Response.json({ note });
}
