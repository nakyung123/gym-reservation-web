import type { NextRequest } from "next/server";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getAdminReservationDailyTrend } from "@/lib/server/db-reservation-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// 대시보드 차트용 범위 상한(두 달). 과도한 범위 조회로 DB를 훑는 것을 막는다.
const TREND_RANGE_MAX_DAYS = 62;

const DAY_MS = 24 * 60 * 60 * 1000;

function rangeDays(from: string, to: string): number {
  return (
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      DAY_MS +
    1
  );
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

  // 사전식 비교가 곧 시간순이라 문자열 비교로 범위 유효성을 검증한다(revenue route와 동일).
  if (from > to) {
    return Response.json(
      { message: "from은 to보다 이후일 수 없습니다." },
      { status: 400 },
    );
  }

  if (rangeDays(from, to) > TREND_RANGE_MAX_DAYS) {
    return Response.json(
      { message: `조회 범위는 최대 ${TREND_RANGE_MAX_DAYS}일입니다.` },
      { status: 400 },
    );
  }

  let trend: Awaited<ReturnType<typeof getAdminReservationDailyTrend>>;
  try {
    trend = await getAdminReservationDailyTrend(from, to);
  } catch (error) {
    return serverErrorResponse(
      "예약 추이를 불러오지 못했습니다.",
      "Failed to fetch admin reservation trend",
      error,
    );
  }
  return Response.json({ trend });
}
