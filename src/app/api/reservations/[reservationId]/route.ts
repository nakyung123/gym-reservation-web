import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { cancelReservationInMysql } from "@/lib/server/mysql-reservation-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reservationId: string }> };

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
      message: result.message,
    },
    { status: 409 },
  );
}
