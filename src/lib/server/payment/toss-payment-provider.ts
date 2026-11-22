import "server-only";
import type {
  CancelPaymentInput,
  ConfirmPaymentInput,
  PaymentProvider,
  ProviderPayment,
  ProviderPaymentState,
  ProviderResult,
} from "@/lib/server/payment/payment-provider";

// 토스페이먼츠 API 구현. 문서: https://docs.tosspayments.com/reference
// - 인증: Basic base64("<시크릿 키>:") (키 뒤 콜론 필수)
// - 승인 POST /v1/payments/confirm, 취소 POST /v1/payments/{paymentKey}/cancel,
//   조회 GET /v1/payments/orders/{orderId} (취소 재시도 확인만 GET /v1/payments/{paymentKey})
// - POST는 Idempotency-Key 헤더를 받는다(15일 유효). 같은 키로 다시 보내면 같은 결과가 온다.

const TOSS_API_BASE = "https://api.tosspayments.com";
const REQUEST_TIMEOUT_MS = 10_000;

// 이 프로젝트는 포트폴리오용이라 테스트 키만 허용한다. live 키가 들어오면 실제 결제가 일어나므로
// 생성 단계에서 막는다(되돌릴 수 없는 피해 차단).
export class TossLiveKeyRejectedError extends Error {
  constructor() {
    super(
      "TOSS_SECRET_KEY가 테스트 키(test_로 시작)가 아닙니다. 이 프로젝트는 실결제를 허용하지 않습니다.",
    );
  }
}

type FetchLike = typeof fetch;

export function createTossPaymentProvider({
  secretKey,
  fetchImpl = fetch,
}: {
  secretKey: string;
  fetchImpl?: FetchLike;
}): PaymentProvider {
  if (!secretKey.startsWith("test_")) {
    throw new TossLiveKeyRejectedError();
  }
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

  async function request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<ProviderResult<ProviderPayment>> {
    const headers: Record<string, string> = { Authorization: authorization };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    let response: Response;
    try {
      response = await fetchImpl(`${TOSS_API_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      // 타임아웃·네트워크 오류: 토스가 처리했는지 알 수 없다.
      return {
        ok: false,
        kind: "unknown",
        code: "NETWORK_ERROR",
        message: "결제사 응답을 받지 못했습니다.",
      };
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const code = readString(json, "code") ?? `HTTP_${response.status}`;
      const message =
        readString(json, "message") ?? "결제사가 요청을 처리하지 못했습니다.";
      return { ok: false, kind: classifyFailure(response.status, code), code, message };
    }

    const payment = toProviderPayment(json);
    if (!payment) {
      return {
        ok: false,
        kind: "unknown",
        code: "INVALID_RESPONSE",
        message: "결제사 응답 형식이 올바르지 않습니다.",
      };
    }
    return { ok: true, value: payment };
  }

  return {
    name: "toss",
    confirm(input: ConfirmPaymentInput) {
      return request(
        "POST",
        "/v1/payments/confirm",
        {
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        },
        input.idempotencyKey,
      );
    },
    async cancel(input: CancelPaymentInput) {
      const result = await request(
        "POST",
        `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
        { cancelReason: input.cancelReason },
        input.idempotencyKey,
      );
      // 이미 취소된 결제를 다시 취소하면 거절이 온다. 실제 상태를 조회해 취소됐으면 성공으로 본다.
      if (!result.ok && result.code === "ALREADY_CANCELED_PAYMENT") {
        return request(
          "GET",
          `/v1/payments/${encodeURIComponent(input.paymentKey)}`,
        );
      }
      return result;
    },
    // 문서: "승인된 결제를 orderId로 조회". API 개별 연동 키(test_sk)로만 호출할 수 있다.
    // 없는 주문은 404 NOT_FOUND_PAYMENT (2026-11-22 테스트 API로 확인).
    getPaymentByOrderId(orderId: string) {
      return request("GET", `/v1/payments/orders/${encodeURIComponent(orderId)}`);
    },
  };
}

// 4xx 대부분은 명확한 거절이다. 단, 아래는 결과를 모르는 상태라 unknown으로 본다.
// - 409 IDEMPOTENT_REQUEST_PROCESSING: 같은 멱등키 요청이 아직 처리 중
// - 429: 요청 과다
// - ALREADY_PROCESSED_PAYMENT: 이미 승인된 결제일 수 있다. 조회 API로 확인해야 한다.
// 5xx는 모두 unknown.
function classifyFailure(status: number, code: string): "rejected" | "unknown" {
  if (status >= 500) return "unknown";
  if (status === 429) return "unknown";
  if (code === "IDEMPOTENT_REQUEST_PROCESSING") return "unknown";
  if (code === "ALREADY_PROCESSED_PAYMENT") return "unknown";
  return "rejected";
}

function toState(status: string): ProviderPaymentState {
  switch (status) {
    case "DONE":
    // 부분 취소는 이 프로젝트에서 하지 않는다. 그래도 들어오면 남은 금액이 결제된 상태로 본다.
    case "PARTIAL_CANCELED":
      return "done";
    case "CANCELED":
      return "canceled";
    case "ABORTED":
    case "EXPIRED":
      return "not-approved";
    default:
      // READY, IN_PROGRESS, WAITING_FOR_DEPOSIT, 그리고 문서에 없는 새 값.
      return "in-progress";
  }
}

function toProviderPayment(json: unknown): ProviderPayment | null {
  const paymentKey = readString(json, "paymentKey");
  const orderId = readString(json, "orderId");
  const status = readString(json, "status");
  const totalAmount =
    json !== null && typeof json === "object"
      ? (json as Record<string, unknown>).totalAmount
      : undefined;
  if (!paymentKey || !orderId || !status || typeof totalAmount !== "number") {
    return null;
  }
  return { paymentKey, orderId, totalAmount, state: toState(status) };
}

function readString(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}
