import type { NextRequest } from "next/server";
import { createUserReservationDetail } from "@/lib/reservation-detail";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  cancelReservationInMysql,
  getUserReservationById,
} from "@/lib/server/mysql-reservation-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reservationId: string }> };

export async function GET(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  const reservation = await getUserReservationById(auth.uid, reservationId);
  if (!reservation) {
    return Response.json(
      { message: "예약을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({
    reservation,
    detail: createUserReservationDetail(reservation),
  });
}

export async function DELETE(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  const result = await cancelReservationInMysql(auth.uid, reservationId);

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
