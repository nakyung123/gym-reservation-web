import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTossPaymentProvider,
  TossLiveKeyRejectedError,
} from "@/lib/server/payment/toss-payment-provider";
import {
  getPaymentMode,
  getPaymentProviderByName,
  getPublicPaymentConfig,
} from "@/lib/server/payment/payment-config";

// 실제 토스로 요청을 보내지 않는다. fetch 대역으로 요청 형식과 응답 해석만 검사한다.
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DONE_BODY = {
  paymentKey: "pk_1",
  orderId: "ord_1234",
  status: "DONE",
  totalAmount: 12000,
};

describe("createTossPaymentProvider", () => {
  it("live 키는 거부한다(실결제 차단)", () => {
    expect(() => createTossPaymentProvider({ secretKey: "live_sk_abc" })).toThrow(
      TossLiveKeyRejectedError,
    );
  });

  it("승인 요청은 Basic 인증(키 뒤 콜론)과 멱등키를 붙여 보내고 DONE을 done으로 해석한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, DONE_BODY));
    const provider = createTossPaymentProvider({ secretKey: "test_sk_abc", fetchImpl });

    const result = await provider.confirm({
      paymentKey: "pk_1",
      orderId: "ord_1234",
      amount: 12000,
      idempotencyKey: "confirm-ord_1234",
    });

    expect(result).toEqual({
      ok: true,
      value: { paymentKey: "pk_1", orderId: "ord_1234", totalAmount: 12000, state: "done" },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("test_sk_abc:").toString("base64")}`,
    );
    expect(init.headers["Idempotency-Key"]).toBe("confirm-ord_1234");
    expect(JSON.parse(init.body)).toEqual({
      paymentKey: "pk_1",
      orderId: "ord_1234",
      amount: 12000,
    });
  });

  it("4xx 거절은 rejected, 5xx·네트워크 오류·처리 중은 unknown으로 나눈다", async () => {
    const cases: Array<[Response | Error, "rejected" | "unknown"]> = [
      [jsonResponse(400, { code: "REJECT_CARD_COMPANY", message: "거절" }), "rejected"],
      [jsonResponse(500, { code: "FAILED_INTERNAL_SYSTEM_PROCESSING", message: "오류" }), "unknown"],
      [jsonResponse(409, { code: "IDEMPOTENT_REQUEST_PROCESSING", message: "처리 중" }), "unknown"],
      [jsonResponse(400, { code: "ALREADY_PROCESSED_PAYMENT", message: "이미 처리" }), "unknown"],
      [new TypeError("fetch failed"), "unknown"],
    ];
    for (const [response, kind] of cases) {
      const fetchImpl =
        response instanceof Error
          ? vi.fn().mockRejectedValue(response)
          : vi.fn().mockResolvedValue(response);
      const provider = createTossPaymentProvider({ secretKey: "test_sk_abc", fetchImpl });
      const result = await provider.confirm({
        paymentKey: "pk_1",
        orderId: "ord_1234",
        amount: 12000,
        idempotencyKey: "k",
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.kind).toBe(kind);
    }
  });

  it("이미 취소된 결제를 다시 취소하면 조회로 확인해 canceled를 돌려준다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, { code: "ALREADY_CANCELED_PAYMENT", message: "이미 취소" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ...DONE_BODY, status: "CANCELED" }));
    const provider = createTossPaymentProvider({ secretKey: "test_sk_abc", fetchImpl });

    const result = await provider.cancel({
      paymentKey: "pk_1",
      cancelReason: "예약 취소",
      idempotencyKey: "refund-ord_1234", // gitleaks:allow 테스트용 멱등키 예시(비밀 값 아님)
    });

    expect(result).toMatchObject({ ok: true, value: { state: "canceled" } });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.tosspayments.com/v1/payments/pk_1");
  });

  it("결제 조회는 우리 orderId로 GET /v1/payments/orders/{orderId} 를 부르고, 없으면 NOT_FOUND_PAYMENT 거절이다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, DONE_BODY))
      // 2026-11-22 테스트 API로 확인한 응답 형식.
      .mockResolvedValueOnce(
        jsonResponse(404, { code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보 입니다." }),
      );
    const provider = createTossPaymentProvider({ secretKey: "test_sk_abc", fetchImpl });

    await expect(provider.getPaymentByOrderId("ord_1234")).resolves.toMatchObject({
      ok: true,
      value: { orderId: "ord_1234", state: "done" },
    });
    await expect(provider.getPaymentByOrderId("ord_missing")).resolves.toMatchObject({
      ok: false,
      kind: "rejected",
      code: "NOT_FOUND_PAYMENT",
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.tosspayments.com/v1/payments/orders/ord_1234",
    );
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
  });
});

describe("payment-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PAYMENT_PROVIDER가 없으면 none, 모르는 값이면 throw한다", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(getPaymentMode()).toBe("none");
    vi.stubEnv("PAYMENT_PROVIDER", "tosss");
    expect(() => getPaymentMode()).toThrow(/PAYMENT_PROVIDER/);
  });

  it("toss 모드에서 live 클라이언트 키·시크릿 키를 거부한다", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "toss");
    vi.stubEnv("TOSS_CLIENT_KEY", "live_ck_abc");
    expect(() => getPublicPaymentConfig()).toThrow(/테스트 키/);
    vi.stubEnv("TOSS_SECRET_KEY", "live_sk_abc");
    expect(() => getPaymentProviderByName("toss")).toThrow(TossLiveKeyRejectedError);
  });

  it("결제위젯 클라이언트 키(test_gck_)는 결제창 연동에 쓸 수 없어 거부한다", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "toss");
    vi.stubEnv("TOSS_CLIENT_KEY", "test_gck_abc");
    expect(() => getPublicPaymentConfig()).toThrow(/API 개별 연동 키/);
  });

  it("toss 모드에서 테스트 클라이언트 키를 화면 설정으로 내려준다", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "toss");
    vi.stubEnv("TOSS_CLIENT_KEY", "test_ck_abc");
    expect(getPublicPaymentConfig()).toEqual({ mode: "toss", clientKey: "test_ck_abc" });
  });
});
