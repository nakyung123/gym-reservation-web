import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { failPaymentInDb } from "@/lib/server/db-payment-repository";

export const dynamic = "force-dynamic";

type FailBody = {
  orderId?: unknown;
  code?: unknown;
};

// 결제창 failUrl에서 호출한다. 결제(pending)를 failed로 닫고 선점한 정원을 돌려준다.
// 이미 닫힌 결제면 아무것도 바꾸지 않는다(같은 요청 반복 안전).
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: FailBody;
  try {
    body = (await request.json()) as FailBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }
  if (
    typeof body.orderId !== "string" ||
    !/^[A-Za-z0-9_=-]{6,64}$/.test(body.orderId)
  ) {
    return Response.json(
      { message: "결제 정보가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  // code는 PG가 failUrl에 붙여 준 오류 코드. 기록용이라 형식만 제한한다.
  const code =
    typeof body.code === "string" && /^[A-Z0-9_]{1,60}$/.test(body.code)
      ? body.code
      : "UNKNOWN";

  try {
    const result = await failPaymentInDb({
      userId: auth.uid,
      orderId: body.orderId,
      code,
    });
    if (result.ok) {
      return Response.json({ status: result.status });
    }
    return Response.json(
      { status: result.status, message: result.message },
      { status: result.status === "not-found" ? 404 : 403 },
    );
  } catch (error) {
    return serverErrorResponse(
      "결제 취소 상태를 기록하지 못했습니다.",
      "Failed to mark payment failed",
      error,
    );
  }
}
