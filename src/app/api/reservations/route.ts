import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createReservationInMysql,
  listUserReservations,
} from "@/lib/server/mysql-reservation-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import type { Sport } from "@/types/domain";

export const dynamic = "force-dynamic";

const sports: readonly Sport[] = [
  "배드민턴",
  "농구",
  "풋살",
  "탁구",
  "배구",
];

function isSport(value: unknown): value is Sport {
  return (
    typeof value === "string" && (sports as readonly string[]).includes(value)
  );
}

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const reservations = await listUserReservations(auth.uid);
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

  const gym = await gymRepository.findById(body.gymId);
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const result = await createReservationInMysql({
    userId: auth.uid,
    draft: {
      gymId: body.gymId,
      sport: body.sport,
      date: body.date,
      time: body.time,
    },
    gym,
  });

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
  return Response.json(
    { status: "rejected", message: result.message },
    { status: 422 },
  );
}
