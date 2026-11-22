"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isPreparedPayment, type PreparedPayment } from "@/lib/payment";
import { isReservation } from "@/lib/reservation-repository";
import { sanitizeFromPath } from "@/lib/use-require-auth";
import type { PaymentMethod, Reservation, Sport } from "@/types/domain";

// 결제 API client 헬퍼. throw 대신 { ok, ... } 결과 객체를 돌려준다(inquiry-client와 같은 형식).
// 서버 메시지를 그대로 보여 주고, 형식이 깨진 응답은 성공으로 처리하지 않는다.

type PaymentClientFailure = {
  ok: false;
  kind: "auth-required" | "processing" | "error";
  message: string;
  status?: number;
  // 서버 응답 본문의 status(예: "manual-refund-required"). 화면이 안내를 고를 때 쓴다.
  code?: string;
};

export type PreparePaymentResult =
  | { ok: true; payment: PreparedPayment }
  | PaymentClientFailure;

export type ConfirmPaymentResult =
  | { ok: true; reservation: Reservation }
  | PaymentClientFailure;

export type PreparePaymentDraft = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
  people: number;
  paymentMethod: PaymentMethod | null;
  phone: string | null;
};

// 결제창 failUrl은 사용자가 창을 닫은 경우(PAY_PROCESS_CANCELED) orderId를 붙여 주지 않는다.
// 결제 시작 전에 같은 탭 sessionStorage에 orderId를 남겨 실패 화면에서 결제를 닫을 수 있게 한다.
const PENDING_ORDER_STORAGE_KEY = "payment-pending-order-id";

async function getIdToken(): Promise<
  { ok: true; idToken: string } | PaymentClientFailure
> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 정보가 없어 결제를 진행할 수 없습니다.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

async function postJson(
  path: string,
  body: unknown,
): Promise<
  | { ok: true; response: Response; data: Record<string, unknown> }
  | PaymentClientFailure
> {
  const token = await getIdToken();
  if (!token.ok) return token;

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
    };
  }

  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed !== null && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { ok: true, response, data };
}

function failureFrom(
  response: Response,
  data: Record<string, unknown>,
  fallback: string,
): PaymentClientFailure {
  const message = typeof data.message === "string" && data.message ? data.message : fallback;
  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "auth-required", message, status: response.status };
  }
  const code = typeof data.status === "string" ? data.status : undefined;
  return { ok: false, kind: "error", message, status: response.status, code };
}

export async function preparePayment(
  draft: PreparePaymentDraft,
): Promise<PreparePaymentResult> {
  const result = await postJson("/api/payments/prepare", draft);
  if (!result.ok) return result;
  const { response, data } = result;
  if (response.status === 201 && isPreparedPayment(data.payment)) {
    return { ok: true, payment: data.payment };
  }
  if (response.ok) {
    return { ok: false, kind: "error", message: "결제 준비 응답 형식이 올바르지 않습니다." };
  }
  return failureFrom(response, data, `결제를 준비하지 못했습니다. (status=${response.status})`);
}

export async function confirmPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<ConfirmPaymentResult> {
  const result = await postJson("/api/payments/confirm", input);
  if (!result.ok) return result;
  const { response, data } = result;
  if ((response.status === 201 || response.status === 200) && isReservation(data.reservation)) {
    return { ok: true, reservation: data.reservation };
  }
  if (response.status === 202) {
    // 서버가 PG 결과를 아직 모른다. 성공으로 보여 주지 않고, 나중에 확인하도록 안내한다.
    return {
      ok: false,
      kind: "processing",
      message:
        typeof data.message === "string"
          ? data.message
          : "결제 승인을 처리하고 있습니다. 잠시 뒤 결과를 다시 확인해 주세요.",
      status: 202,
    };
  }
  if (response.ok) {
    return { ok: false, kind: "error", message: "결제 승인 응답 형식이 올바르지 않습니다." };
  }
  return failureFrom(response, data, `결제를 승인하지 못했습니다. (status=${response.status})`);
}

export async function failPayment(input: {
  orderId: string;
  code: string;
}): Promise<{ ok: true } | PaymentClientFailure> {
  const result = await postJson("/api/payments/fail", input);
  if (!result.ok) return result;
  if (result.response.ok) return { ok: true };
  return failureFrom(result.response, result.data, "결제 취소 상태를 기록하지 못했습니다.");
}

export type PendingOrder = { orderId: string; returnPath: string | null };

// 결제창으로 떠나기 전 orderId와 돌아올 예약 화면 경로를 남긴다.
function rememberPendingOrder(order: PendingOrder): void {
  try {
    window.sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // sessionStorage를 못 쓰면 실패 화면에서 결제를 바로 닫지 못한다. 선점은 15분 뒤 만료로 풀린다.
  }
}

// 저장해 둔 결제 정보를 꺼내고 지운다. returnPath는 같은 사이트 경로만 남긴다.
export function popPendingOrder(): PendingOrder | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    window.sessionStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.orderId !== "string") return null;
    return {
      orderId: record.orderId,
      returnPath: sanitizeFromPath(
        typeof record.returnPath === "string" ? record.returnPath : null,
      ),
    };
  } catch {
    return null;
  }
}

// 토스 결제창을 띄운다. redirect 방식이라 성공·실패 모두 successUrl/failUrl로 이동한다.
// SDK 로드나 결제창 호출이 실패하면 throw하지 않고 실패 결과를 돌려준다.
// 고객 이름 등 개인정보는 보내지 않는다(필수 값이 아니고, 결제에 필요한 것은 금액·주문 정보뿐이다).
export async function openTossCheckout({
  clientKey,
  payment,
}: {
  clientKey: string;
  payment: PreparedPayment;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  try {
    const { loadTossPayments, ANONYMOUS } = await import(
      "@tosspayments/tosspayments-sdk"
    );
    const tossPayments = await loadTossPayments(clientKey);
    const checkout = tossPayments.payment({ customerKey: ANONYMOUS });
    rememberPendingOrder({
      orderId: payment.orderId,
      returnPath: `${window.location.pathname}${window.location.search}`,
    });
    await checkout.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: payment.amount },
      orderId: payment.orderId,
      orderName: payment.orderName,
      successUrl: `${window.location.origin}/reserve/payment/success`,
      failUrl: `${window.location.origin}/reserve/payment/fail`,
    });
    return { ok: true };
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "CHECKOUT_FAILED";
    const message =
      error instanceof Error && error.message
        ? error.message
        : "결제창을 열지 못했습니다.";
    return { ok: false, code, message };
  }
}
