import type { NextRequest } from "next/server";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  cancelReservationAsAdminInMysql,
  getAdminReservationById,
  markReservationUsedInMysql,
} from "@/lib/server/mysql-reservation-repository";

export const dynamic = "force-dynamic";

type UpdateReservationBody = {
  status?: unknown;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const auth = verifyAdminTokenFromRequest(request);
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
  const auth = verifyAdminTokenFromRequest(request);
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
      typeof markReservationUsedInMysql | typeof cancelReservationAsAdminInMysql
    >
  >;
  try {
    result =
      body.status === "used"
        ? await markReservationUsedInMysql(reservationId)
        : await cancelReservationAsAdminInMysql(reservationId);
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

  return Response.json({
    status: result.status,
    reservation: result.reservation,
    message: result.message,
  });
}
