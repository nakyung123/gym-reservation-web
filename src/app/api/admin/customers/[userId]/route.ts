import type { NextRequest } from "next/server";
import type { CustomerDetail } from "@/lib/admin/customer";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getCustomerCoreDetail } from "@/lib/server/db-customer-repository";
import { listUserNotes } from "@/lib/server/db-user-note-repository";
import { getFirebaseUserMeta } from "@/lib/server/firebase-user-lookup";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
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

  const { userId } = await params;

  let core: Awaited<ReturnType<typeof getCustomerCoreDetail>>;
  let notes: Awaited<ReturnType<typeof listUserNotes>>;
  try {
    [core, notes] = await Promise.all([
      getCustomerCoreDetail(userId),
      listUserNotes(userId),
    ]);
  } catch (error) {
    return serverErrorResponse(
      "고객 상세를 불러오지 못했습니다.",
      "Failed to fetch admin customer detail",
      error,
    );
  }

  // Firebase 메타 조회 실패는 본 상세 응답을 막지 않고 firebaseError 플래그로 표면화한다.
  // (데이터 없음 = null, 조회 실패 = firebaseError true 로 구분)
  let firebase: CustomerDetail["firebase"] = null;
  let firebaseError = false;
  try {
    firebase = await getFirebaseUserMeta(userId);
  } catch (error) {
    firebaseError = true;
    console.error(
      `[admin-customer] Firebase 메타 조회 실패 uid=${userId}`,
      error,
    );
  }

  // 어디에도 흔적이 없고 Firebase 조회도 정상(실패 아님)인데 비어 있으면 존재하지 않는 고객.
  const hasAnyTrace =
    core.profile !== null ||
    firebase !== null ||
    core.reservations.total > 0 ||
    core.activeFavoriteCount > 0 ||
    notes.length > 0;
  if (!hasAnyTrace && !firebaseError) {
    return Response.json(
      { message: "고객을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const detail: CustomerDetail = {
    userId,
    profile: core.profile,
    reservations: core.reservations,
    activeFavoriteCount: core.activeFavoriteCount,
    firebase,
    firebaseError,
  };

  return Response.json({ detail, notes });
}
