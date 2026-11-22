import { after, type NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  confirmPaymentInDb,
  type ConfirmPaymentOutput,
} from "@/lib/server/db-payment-repository";
import {
  getPaymentMode,
  getPaymentProviderByName,
} from "@/lib/server/payment/payment-config";
import type { PaymentProvider } from "@/lib/server/payment/payment-provider";
import { gymRepository } from "@/lib/gym-repository-provider";
import { notifyReservationEvent } from "@/lib/server/reservation-notify";

export const dynamic = "force-dynamic";

type ConfirmBody = {
  paymentKey?: unknown;
  orderId?: unknown;
  amount?: unknown;
};

type ConfirmFailureStatus = Extract<ConfirmPaymentOutput, { ok: false }>["status"];

const FAILURE_HTTP_STATUS: Record<ConfirmFailureStatus, number> = {
  "not-found": 404,
  forbidden: 403,
  "amount-mismatch": 400,
  expired: 409,
  "not-pending": 409,
  processing: 202,
  rejected: 422,
  "refunded-after-failure": 409,
  "refund-pending-after-failure": 502,
  // 다시 보내도 결과가 같다(사람이 환불해야 한다). 4xx라 화면이 다시 시도 버튼을 띄우지 않는다.
  "manual-refund-required": 409,
};

// [C] 결제 승인: 결제창 successUrl에서 받은 값으로 PG 승인 → 예약 확정.
// 같은 요청을 다시 보내도 예약은 1건만 생긴다.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }
  if (
    typeof body.paymentKey !== "string" ||
    body.paymentKey.length === 0 ||
    body.paymentKey.length > 200 ||
    typeof body.orderId !== "string" ||
    !/^[A-Za-z0-9_=-]{6,64}$/.test(body.orderId) ||
    typeof body.amount !== "number" ||
    !Number.isInteger(body.amount)
  ) {
    return Response.json(
      { message: "결제 승인 요청이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let provider: PaymentProvider;
  try {
    const mode = getPaymentMode();
    if (mode === "none") {
      return Response.json(
        { message: "결제 기능이 꺼져 있습니다." },
        { status: 404 },
      );
    }
    provider = getPaymentProviderByName(mode);
  } catch (error) {
    return serverErrorResponse(
      "결제 설정을 확인하지 못했습니다.",
      "Invalid payment provider configuration",
      error,
    );
  }

  let result: ConfirmPaymentOutput;
  try {
    result = await confirmPaymentInDb({
      userId: auth.uid,
      orderId: body.orderId,
      paymentKey: body.paymentKey,
      amount: body.amount,
      provider,
    });
  } catch (error) {
    return serverErrorResponse(
      "결제 승인을 처리하지 못했습니다. 잠시 뒤 결과를 다시 확인해 주세요.",
      "Failed to confirm payment",
      error,
    );
  }

  if (result.ok) {
    const reservation = result.reservation;
    if (result.status === "confirmed") {
      // 새로 확정된 경우에만 알림. 같은 승인 재요청(already-confirmed)에는 보내지 않는다.
      let gymName = reservation.gymId;
      try {
        const gym = await gymRepository.findById(reservation.gymId);
        if (gym) gymName = gym.name;
      } catch (error) {
        console.error("[payment confirm] 시설명 조회 실패(알림 라벨 폴백)", error);
      }
      after(() =>
        notifyReservationEvent({
          kind: "created",
          gymName,
          sport: reservation.sport,
          date: reservation.date,
          time: reservation.time,
        }),
      );
    }
    return Response.json(
      { status: result.status, reservation },
      { status: result.status === "confirmed" ? 201 : 200 },
    );
  }

  return Response.json(
    { status: result.status, message: result.message },
    { status: FAILURE_HTTP_STATUS[result.status] },
  );
}
