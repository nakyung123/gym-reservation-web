import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { preparePaymentInDb } from "@/lib/server/db-payment-repository";
import { getPaymentMode } from "@/lib/server/payment/payment-config";
import { parseCreateReservationRequest } from "@/lib/server/reservation-create-request";
import {
  checkRateLimit,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// [A] 결제 준비: 슬롯 정원 1 선점 + 결제(pending) 생성. 응답의 orderId·amount로 결제창을 띄운다.
// 금액은 서버가 계산한 값만 쓴다.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let mode: ReturnType<typeof getPaymentMode>;
  try {
    mode = getPaymentMode();
  } catch (error) {
    return serverErrorResponse(
      "결제 설정을 확인하지 못했습니다.",
      "Invalid payment mode configuration",
      error,
    );
  }
  if (mode === "none") {
    return Response.json(
      { message: "결제 기능이 꺼져 있습니다." },
      { status: 404 },
    );
  }

  // 선점은 정원을 15분간 잡는다. 한 사용자가 여러 슬롯을 계속 잡지 못하게 막는다.
  try {
    const limit = await checkRateLimit({
      scope: "payment-prepare:uid",
      identifier: auth.uid,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.ok) return rateLimitedJsonResponse(limit);
  } catch (error) {
    return serverErrorResponse(
      "요청을 처리하지 못했습니다.",
      "Rate limit check failed for payment prepare",
      error,
    );
  }

  const parsed = await parseCreateReservationRequest(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  let result: Awaited<ReturnType<typeof preparePaymentInDb>>;
  try {
    result = await preparePaymentInDb({
      userId: auth.uid,
      draft: parsed.value.draft,
      gym: parsed.value.gym,
      provider: mode,
    });
  } catch (error) {
    return serverErrorResponse(
      "결제를 준비하지 못했습니다.",
      "Failed to prepare payment",
      error,
    );
  }

  if (result.ok) {
    return Response.json({ payment: result.payment }, { status: 201 });
  }
  if (result.status === "duplicate") {
    return Response.json(
      { status: "duplicate", reservation: result.reservation, message: result.message },
      { status: 409 },
    );
  }
  if (result.status === "full") {
    return Response.json(
      { status: "full", slot: result.slot, message: result.message },
      { status: 409 },
    );
  }
  if (result.status === "in-progress") {
    return Response.json(
      { status: "in-progress", message: result.message },
      { status: 409 },
    );
  }
  return Response.json(
    { status: "rejected", message: result.message },
    { status: 422 },
  );
}
