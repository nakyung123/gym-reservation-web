import type {
  CancelPaymentInput,
  ConfirmPaymentInput,
  PaymentProvider,
  ProviderPayment,
  ProviderResult,
} from "@/lib/server/payment/payment-provider";

// 테스트용 가짜 PG. 실제 토스처럼 멱등키별로 결과를 기억하고, 실패를 주입할 수 있다.
// 호출 기록(calls)으로 "PG에 승인/취소를 보냈는가"를 검사한다.
export type FakePaymentProvider = PaymentProvider & {
  calls: {
    confirm: ConfirmPaymentInput[];
    cancel: CancelPaymentInput[];
    getPaymentByOrderId: string[];
  };
  // 다음 호출 결과를 바꾼다. 지정하지 않으면 정상 승인/정상 취소.
  nextConfirm: ProviderResult<ProviderPayment> | null;
  nextCancel: ProviderResult<ProviderPayment> | null;
  // PG 쪽 결제 상태(paymentKey별). getPaymentByOrderId는 이 중 orderId가 같은 것을 돌려준다.
  payments: Map<string, ProviderPayment>;
  // getPaymentByOrderId 응답 전 대기 시간. 두 정리 작업이 겹치는 상황을 만들 때 쓴다.
  getPaymentDelayMs: number;
};

export function createFakePaymentProvider(): FakePaymentProvider {
  const fake: FakePaymentProvider = {
    name: "toss",
    calls: { confirm: [], cancel: [], getPaymentByOrderId: [] },
    nextConfirm: null,
    nextCancel: null,
    payments: new Map(),
    getPaymentDelayMs: 0,
    async confirm(input) {
      fake.calls.confirm.push(input);
      const override = fake.nextConfirm;
      fake.nextConfirm = null;
      if (override) return override;
      const payment: ProviderPayment = {
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        totalAmount: input.amount,
        state: "done",
      };
      fake.payments.set(input.paymentKey, payment);
      return { ok: true, value: payment };
    },
    async cancel(input) {
      fake.calls.cancel.push(input);
      const override = fake.nextCancel;
      fake.nextCancel = null;
      if (override) return override;
      const existing = fake.payments.get(input.paymentKey);
      if (!existing) {
        // 실제 토스처럼 모르는 결제키의 취소는 거절한다. 잘못된 키로 환불하는 버그를 테스트가 잡게 한다.
        return {
          ok: false,
          kind: "rejected",
          code: "NOT_FOUND_PAYMENT",
          message: "존재하지 않는 결제 정보 입니다.",
        };
      }
      const payment: ProviderPayment = { ...existing, state: "canceled" };
      fake.payments.set(input.paymentKey, payment);
      return { ok: true, value: payment };
    },
    async getPaymentByOrderId(orderId) {
      fake.calls.getPaymentByOrderId.push(orderId);
      if (fake.getPaymentDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fake.getPaymentDelayMs));
      }
      const payment = [...fake.payments.values()].find((p) => p.orderId === orderId);
      if (!payment) {
        return {
          ok: false,
          kind: "rejected",
          code: "NOT_FOUND_PAYMENT",
          message: "존재하지 않는 결제 정보 입니다.",
        };
      }
      return { ok: true, value: payment };
    },
  };
  return fake;
}

export const UNKNOWN_FAILURE = {
  ok: false,
  kind: "unknown",
  code: "NETWORK_ERROR",
  message: "결제사 응답을 받지 못했습니다.",
} as const;

export const REJECTED_FAILURE = {
  ok: false,
  kind: "rejected",
  code: "REJECT_CARD_COMPANY",
  message: "카드사에서 거절했습니다.",
} as const;
