import { after, type NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createReservationInDb,
  listUserReservations,
} from "@/lib/server/db-reservation-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import {
  isPaymentMethod,
  isReservationStatus,
  isSport,
} from "@/lib/domain-constants";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { notifyReservationEvent } from "@/lib/server/reservation-notify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const status = request.nextUrl.searchParams.get("status");
  if (status !== null && !isReservationStatus(status)) {
    return Response.json(
      { message: "status는 reserved, cancelled, used 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  let reservations: Awaited<ReturnType<typeof listUserReservations>>;
  try {
    reservations = await listUserReservations(auth.uid, {
      status: status ?? undefined,
    });
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
  people?: unknown;
  paymentMethod?: unknown;
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

  // people은 전송용 transient(미전송 시 서버가 1로 처리). 보낸 경우 number만 허용하고,
  // 범위 검증(정원 초과·비정수)은 createReservationInDb의 isValidPeople이 422로 reject한다.
  if (body.people !== undefined && typeof body.people !== "number") {
    return Response.json(
      { message: "이용 인원이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const people = body.people;

  // paymentMethod는 선택적(미전송 시 null). 보낸 경우 알려진 결제 수단만 허용한다.
  if (body.paymentMethod !== undefined && !isPaymentMethod(body.paymentMethod)) {
    return Response.json(
      { message: "결제 수단이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const paymentMethod = isPaymentMethod(body.paymentMethod)
    ? body.paymentMethod
    : null;

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

  let result: Awaited<ReturnType<typeof createReservationInDb>>;
  try {
    result = await createReservationInDb({
      userId: auth.uid,
      draft: {
        gymId: body.gymId,
        sport: body.sport,
        date: body.date,
        time: body.time,
        people,
        paymentMethod,
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
    const reservation = result.reservation;
    // 알림은 사이드이펙트라 응답 후(after)에 실행한다 → 사용자 응답 지연 0,
    // Vercel이 함수를 유지해 실행을 보장. 알림 실패는 best-effort로 삼켜진다.
    after(() =>
      notifyReservationEvent({
        kind: "created",
        gymName: gym.name,
        sport: reservation.sport,
        date: reservation.date,
        time: reservation.time,
      }),
    );
    return Response.json(
      { status: "created", reservation: reservation },
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
