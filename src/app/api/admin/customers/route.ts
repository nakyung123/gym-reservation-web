import type { NextRequest } from "next/server";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { listCustomers } from "@/lib/server/db-customer-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

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

export async function GET(request: NextRequest) {
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

  const q = request.nextUrl.searchParams.get("q");

  let limit: number | undefined;
  try {
    limit = parseLimit(request.nextUrl.searchParams.get("limit"));
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

  let customers: Awaited<ReturnType<typeof listCustomers>>;
  try {
    customers = await listCustomers({ q: q ?? undefined, limit });
  } catch (error) {
    return serverErrorResponse(
      "고객 목록을 불러오지 못했습니다.",
      "Failed to list admin customers",
      error,
    );
  }

  return Response.json({ customers });
}
