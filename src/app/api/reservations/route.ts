import { after, type NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createReservationInDb,
  listUserReservations,
  listUserReservationsPage,
} from "@/lib/server/db-reservation-repository";
import { isReservationStatus, isSport } from "@/lib/domain-constants";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { notifyReservationEvent } from "@/lib/server/reservation-notify";
import { getPaymentMode } from "@/lib/server/payment/payment-config";
import { parseCreateReservationRequest } from "@/lib/server/reservation-create-request";

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

  // 슬롯 단위 필터(선택). 예약 폼이 (체육관·종목·날짜) 범위의 활성 예약만 받을 때 쓴다.
  // 셋 다 선택적이며, 미지정이면 기존처럼 전체 목록을 반환한다.
  const gymId = request.nextUrl.searchParams.get("gymId");
  const sport = request.nextUrl.searchParams.get("sport");
  const date = request.nextUrl.searchParams.get("date");

  if (sport !== null && !isSport(sport)) {
    return Response.json(
      { message: "sport 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (date !== null && !isValidReservationDateValue(date)) {
    return Response.json(
      { message: "date는 YYYY-MM-DD 형식이어야 합니다." },
      { status: 400 },
    );
  }

  // page가 오면 페이지 단위로 응답한다(목록 화면). 없으면 기존처럼 전체를 반환한다.
  const pageParam = request.nextUrl.searchParams.get("page");
  if (pageParam !== null) {
    const parsedPage = Number(pageParam);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      return Response.json(
        { message: "page는 1 이상의 정수여야 합니다." },
        { status: 400 },
      );
    }

    try {
      const result = await listUserReservationsPage(auth.uid, {
        page: parsedPage,
      });
      return Response.json(result);
    } catch (error) {
      return serverErrorResponse(
        "예약 목록을 불러오지 못했습니다.",
        "Failed to list user reservations page",
        error,
      );
    }
  }

  let reservations: Awaited<ReturnType<typeof listUserReservations>>;
  try {
    reservations = await listUserReservations(auth.uid, {
      status: status ?? undefined,
      gymId: gymId ?? undefined,
      sport: sport ?? undefined,
      date: date ?? undefined,
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

export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  // 결제 모드에서는 결제 없이 예약을 만들 수 없다(결제 우회 차단).
  // 예약은 /api/payments/prepare → 결제창 → /api/payments/confirm 경로로만 만들어진다.
  let paymentMode: ReturnType<typeof getPaymentMode>;
  try {
    paymentMode = getPaymentMode();
  } catch (error) {
    return serverErrorResponse(
      "결제 설정을 확인하지 못했습니다.",
      "Invalid payment mode configuration",
      error,
    );
  }
  if (paymentMode !== "none") {
    return Response.json(
      {
        status: "payment-required",
        message: "결제를 거쳐야 예약할 수 있습니다. 예약 화면에서 다시 진행해 주세요.",
      },
      { status: 409 },
    );
  }

  const parsed = await parseCreateReservationRequest(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { draft, gym } = parsed.value;

  let result: Awaited<ReturnType<typeof createReservationInDb>>;
  try {
    result = await createReservationInDb({
      userId: auth.uid,
      draft,
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
