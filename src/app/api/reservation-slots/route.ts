import type { NextRequest } from "next/server";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { listReservationSlotAvailabilities } from "@/lib/server/mysql-reservation-repository";
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

  const gym = await gymRepository.findById(gymId);
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

  const slots = await listReservationSlotAvailabilities({ gym, sport, date });
  return Response.json({ slots });
}
