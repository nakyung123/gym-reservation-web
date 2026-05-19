import type { NextRequest } from "next/server";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { listReservationSlotAvailabilities } from "@/lib/server/db-reservation-repository";
import { isSport } from "@/lib/domain-constants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gymId = request.nextUrl.searchParams.get("gymId");
  const sport = request.nextUrl.searchParams.get("sport");
  const date = request.nextUrl.searchParams.get("date");

  if (!gymId || !isSport(sport) || !date || !isValidReservationDateValue(date)) {
    return Response.json(
      { message: "슬롯 조회 조건이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
  try {
    gym = await gymRepository.findById(gymId);
  } catch (error) {
    return serverErrorResponse(
      "체육관 정보를 불러오지 못했습니다.",
      "Failed to fetch gym for reservation slots",
      error,
    );
  }
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (!gym.sports.includes(sport)) {
    return Response.json(
      { message: "선택한 종목은 이 체육관에서 예약할 수 없습니다." },
      { status: 400 },
    );
  }

  let slots: Awaited<ReturnType<typeof listReservationSlotAvailabilities>>;
  try {
    slots = await listReservationSlotAvailabilities({ gym, sport, date });
  } catch (error) {
    return serverErrorResponse(
      "슬롯 정보를 불러오지 못했습니다.",
      "Failed to list reservation slot availabilities",
      error,
    );
  }
  return Response.json({ slots });
}
