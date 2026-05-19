import type { NextRequest } from "next/server";
import { createUserReservationDetail } from "@/lib/reservation-detail";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  cancelReservationInDb,
  getUserReservationDetailById,
} from "@/lib/server/db-reservation-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reservationId: string }> };

export async function GET(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  let record: Awaited<ReturnType<typeof getUserReservationDetailById>>;
  try {
    record = await getUserReservationDetailById(auth.uid, reservationId);
  } catch (error) {
    return serverErrorResponse(
      "예약 상세를 불러오지 못했습니다.",
      "Failed to fetch user reservation detail",
      error,
    );
  }
  if (!record) {
    return Response.json(
      { message: "예약을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({
    reservation: record.reservation,
    detail: createUserReservationDetail(record.reservation),
    gym: record.gym,
  });
}

export async function DELETE(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  let result: Awaited<ReturnType<typeof cancelReservationInDb>>;
  try {
    result = await cancelReservationInDb(auth.uid, reservationId);
  } catch (error) {
    return serverErrorResponse(
      "예약을 취소하지 못했습니다.",
      "Failed to cancel user reservation",
      error,
    );
  }

  if (result.ok) {
    return Response.json({
      status: result.status,
      reservation: result.reservation,
      detail: createUserReservationDetail(result.reservation),
      message: result.message,
    });
  }

  if (result.status === "not-found") {
    return Response.json({ message: result.message }, { status: 404 });
  }
  if (result.status === "auth-required") {
    return Response.json({ message: result.message }, { status: 403 });
  }
  return Response.json(
    {
      status: result.status,
      reservation: result.reservation,
      detail: result.reservation
        ? createUserReservationDetail(result.reservation)
        : null,
      message: result.message,
    },
    { status: 409 },
  );
}
