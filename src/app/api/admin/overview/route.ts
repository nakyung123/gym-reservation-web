import type { NextRequest } from "next/server";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getAdminReservationOverview } from "@/lib/server/db-reservation-repository";
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

  const auth = verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const date = request.nextUrl.searchParams.get("date");
  if (!date || !isValidReservationDateValue(date)) {
    return Response.json(
      { message: "date는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  let overview: Awaited<ReturnType<typeof getAdminReservationOverview>>;
  try {
    overview = await getAdminReservationOverview(date);
  } catch (error) {
    return serverErrorResponse(
      "관리자 운영 요약을 불러오지 못했습니다.",
      "Failed to fetch admin reservation overview",
      error,
    );
  }
  return Response.json({ overview });
}
