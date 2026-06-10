import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import {
  cancelReservationAsAdminInDb,
  getAdminReservationById,
  markReservationUsedInDb,
} from "@/lib/server/db-reservation-repository";
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

type UpdateReservationBody = {
  status?: unknown;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await params;
  let reservation: Awaited<ReturnType<typeof getAdminReservationById>>;
  try {
    reservation = await getAdminReservationById(reservationId);
  } catch (error) {
    return serverErrorResponse(
      "관리자 예약 상세를 불러오지 못했습니다.",
      "Failed to fetch admin reservation detail",
      error,
    );
  }
  if (!reservation) {
    return Response.json(
      { message: "예약을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({ reservation });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: UpdateReservationBody;
  try {
    body = (await request.json()) as UpdateReservationBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (body.status !== "used" && body.status !== "cancelled") {
    return Response.json(
      { message: "관리자 예약 변경은 status=used 또는 cancelled만 지원합니다." },
      { status: 400 },
    );
  }

  const { reservationId } = await params;
  let result: Awaited<
    ReturnType<
      typeof markReservationUsedInDb | typeof cancelReservationAsAdminInDb
    >
  >;
  try {
    result =
      body.status === "used"
        ? await markReservationUsedInDb(reservationId)
        : await cancelReservationAsAdminInDb(reservationId);
  } catch (error) {
    return serverErrorResponse(
      "관리자 예약 상태를 변경하지 못했습니다.",
      "Failed to update admin reservation status",
      error,
    );
  }

  if (!result.ok) {
    return Response.json(
      {
        status: result.status,
        reservation: result.reservation,
        message: result.message,
      },
      { status: result.status === "not-found" ? 404 : 409 },
    );
  }

  // 실제 상태 변경이 일어난 경우에만 audit를 남긴다.
  // status === "unchanged"(이미 같은 상태)는 idempotent no-op이므로 기록하지 않는다(중복 기록 방지).
  if (result.status === "used" || result.status === "cancelled") {
    await safeRecordAuditLog({
      adminUid: auth.uid,
      action:
        result.status === "used"
          ? AUDIT_ACTIONS.reservationUse
          : AUDIT_ACTIONS.reservationCancel,
      targetType: "reservation",
      targetId: result.reservation.id,
      summary: `예약 ${result.status === "used" ? "이용 완료" : "취소"} 처리 (${result.reservation.gymId}/${result.reservation.sport} ${result.reservation.date} ${result.reservation.time})`,
      metadata: {
        reservationUserId: result.reservation.userId,
        gymId: result.reservation.gymId,
        sport: result.reservation.sport,
        date: result.reservation.date,
        time: result.reservation.time,
        toStatus: result.reservation.status,
      },
    });
  }

  return Response.json({
    status: result.status,
    reservation: result.reservation,
    message: result.message,
  });
}
