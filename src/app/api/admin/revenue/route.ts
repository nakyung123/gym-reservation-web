import type { NextRequest } from "next/server";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getRevenueSummary } from "@/lib/server/db-revenue-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

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

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (
    !from ||
    !to ||
    !isValidReservationDateValue(from) ||
    !isValidReservationDateValue(to)
  ) {
    return Response.json(
      { message: "from·to는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  // 사전식 비교가 곧 시간순이라 문자열 비교로 범위 유효성을 검증한다.
  if (from > to) {
    return Response.json(
      { message: "from은 to보다 이후일 수 없습니다." },
      { status: 400 },
    );
  }

  let summary: Awaited<ReturnType<typeof getRevenueSummary>>;
  try {
    summary = await getRevenueSummary({ from, to });
  } catch (error) {
    return serverErrorResponse(
      "매출/정산 요약을 불러오지 못했습니다.",
      "Failed to fetch admin revenue summary",
      error,
    );
  }
  return Response.json({ summary });
}
