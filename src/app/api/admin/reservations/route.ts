import type { NextRequest } from "next/server";
import { isReservationStatus } from "@/lib/domain-constants";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { listAdminReservations } from "@/lib/server/mysql-reservation-repository";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;

  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error("limit은 1 이상 200 이하의 정수여야 합니다.");
  }

  const limit = Number(normalizedValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit은 1 이상 200 이하의 정수여야 합니다.");
  }
  return limit;
}

export async function GET(request: NextRequest) {
  const auth = verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const status = request.nextUrl.searchParams.get("status");
  const gymId = request.nextUrl.searchParams.get("gymId");
  const date = request.nextUrl.searchParams.get("date");
  const userId = request.nextUrl.searchParams.get("userId");

  if (status !== null && !isReservationStatus(status)) {
    return Response.json(
      { message: "status는 reserved, cancelled, used 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  if (date !== null && !isValidReservationDateValue(date)) {
    return Response.json(
      { message: "date는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  let limit: number | undefined;
  try {
    limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "limit 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  const reservations = await listAdminReservations({
    status: status ?? undefined,
    gymId: gymId ?? undefined,
    date: date ?? undefined,
    userId: userId ?? undefined,
    limit,
  });

  return Response.json({ reservations });
}
