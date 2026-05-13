import type { NextRequest } from "next/server";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { getAdminReservationOverview } from "@/lib/server/mysql-reservation-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  const overview = await getAdminReservationOverview(date);
  return Response.json({ overview });
}
