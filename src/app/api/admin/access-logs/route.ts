import type { NextRequest } from "next/server";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  listAdminAccessLogs,
  safeRecordAdminAccess,
} from "@/lib/server/db-admin-access-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";
import { ADMIN_ACCESS_USER_AGENT_MAX } from "@/lib/admin/access-log";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("limit은 1 이상 200 이하의 정수여야 합니다.");
  }
  const limit = Number(normalized);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit은 1 이상 200 이하의 정수여야 합니다.");
  }
  return limit;
}

// 접속 경로는 admin 내부 경로만 허용한다(위조 방지). 그 외 값은 기본값으로 대체.
function normalizePath(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/admin")) {
    return value;
  }
  return "/admin";
}

async function requireAdmin(request: NextRequest) {
  const ipLimit = await checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) {
    return { ok: false as const, response: rateLimitedJsonResponse(ipLimit) };
  }

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: Response.json({ message: auth.message }, { status: auth.status }),
    };
  }

  return { ok: true as const, uid: auth.uid };
}

// 관리자 콘솔 접속을 1건 기록한다. best-effort이므로 기록 실패해도 204로 응답해
// 콘솔 진입 흐름을 막지 않는다(부가 기록의 실패 격리이며 본 액션의 silent fallback 아님).
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const ip = extractClientIp(request.headers);
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(
    0,
    ADMIN_ACCESS_USER_AGENT_MAX,
  );

  let path = "/admin";
  try {
    const body = (await request.json()) as { path?: unknown };
    path = normalizePath(body?.path);
  } catch {
    // body가 없거나 JSON이 아니면 기본 경로로 기록한다.
  }

  await safeRecordAdminAccess({ adminUid: gate.uid, ip, userAgent, path });
  return new Response(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const params = request.nextUrl.searchParams;
  const adminUid = params.get("adminUid");

  let limit: number | undefined;
  try {
    limit = parseLimit(params.get("limit"));
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "limit 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  let accessLogs: Awaited<ReturnType<typeof listAdminAccessLogs>>;
  try {
    accessLogs = await listAdminAccessLogs({
      adminUid: adminUid ?? undefined,
      limit,
    });
  } catch (error) {
    return serverErrorResponse(
      "접속 기록을 불러오지 못했습니다.",
      "Failed to list admin access logs",
      error,
    );
  }

  return Response.json({ accessLogs });
}
