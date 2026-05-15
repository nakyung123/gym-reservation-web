import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createReservationInMysql,
  listUserReservations,
} from "@/lib/server/mysql-reservation-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isSport } from "@/lib/domain-constants";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let reservations: Awaited<ReturnType<typeof listUserReservations>>;
  try {
    reservations = await listUserReservations(auth.uid);
  } catch (error) {
    return serverErrorResponse(
      "예약 목록을 불러오지 못했습니다.",
      "Failed to list user reservations",
      error,
    );
  }
  return Response.json({ reservations });
}

type CreateBody = {
  gymId?: unknown;
  sport?: unknown;
  date?: unknown;
  time?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.gymId !== "string" ||
    !isSport(body.sport) ||
    typeof body.date !== "string" ||
    typeof body.time !== "string"
  ) {
    return Response.json(
      { message: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
  try {
    gym = await gymRepository.findById(body.gymId);
  } catch (error) {
    return serverErrorResponse(
      "체육관 정보를 불러오지 못했습니다.",
      "Failed to fetch gym for reservation creation",
      error,
    );
  }
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  let result: Awaited<ReturnType<typeof createReservationInMysql>>;
  try {
    result = await createReservationInMysql({
      userId: auth.uid,
      draft: {
        gymId: body.gymId,
        sport: body.sport,
        date: body.date,
        time: body.time,
      },
      gym,
    });
  } catch (error) {
    return serverErrorResponse(
      "예약 요청을 처리하지 못했습니다.",
      "Failed to create reservation",
      error,
    );
  }

  if (result.ok) {
    return Response.json(
      { status: "created", reservation: result.reservation },
      { status: 201 },
    );
  }
  if (result.status === "duplicate") {
    return Response.json(
      {
        status: "duplicate",
        reservation: result.reservation,
        message: result.message,
      },
      { status: 409 },
    );
  }
  if (result.status === "full") {
    return Response.json(
      {
        status: "full",
        slot: result.slot,
        message: result.message,
      },
      { status: 409 },
    );
  }
  return Response.json(
    { status: "rejected", message: result.message },
    { status: 422 },
  );
}
