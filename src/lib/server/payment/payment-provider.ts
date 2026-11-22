import "server-only";

// PG(결제대행사) 경계. 도메인 코드는 이 인터페이스만 알고 토스 API 형식은 모른다.
// 모든 메서드는 throw 대신 결과 타입을 돌려준다. 호출자가 실패 종류에 따라 처리를 정한다.
//
// 실패 종류(kind):
// - "rejected": PG가 명확히 거절했다(카드 한도, 잘못된 요청, 이미 만료 등). 다시 보내도 결과가 같다.
// - "unknown": 타임아웃·네트워크·PG 5xx. 실제로 처리됐는지 모른다. 같은 멱등키로 다시 보내거나
//              조회 API로 상태를 확인해야 한다.

export type PaymentProviderName = "toss";

export type ProviderFailure = {
  ok: false;
  kind: "rejected" | "unknown";
  code: string;
  message: string;
};

export type ProviderResult<T> = { ok: true; value: T } | ProviderFailure;

// PG 쪽 결제 상태를 우리 판단에 필요한 만큼만 줄인 값.
// - "done": 승인 완료(돈이 빠져나감, 테스트 모드에서는 가상)
// - "canceled": 전액 취소됨
// - "not-approved": 승인 안 됨(실패·만료·중단). 돈이 빠져나가지 않았다.
// - "in-progress": 아직 결제창 진행 중이거나 승인 대기
export type ProviderPaymentState =
  | "done"
  | "canceled"
  | "not-approved"
  | "in-progress";

export type ProviderPayment = {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  state: ProviderPaymentState;
};

export type ConfirmPaymentInput = {
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
};

export type CancelPaymentInput = {
  paymentKey: string;
  cancelReason: string;
  idempotencyKey: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  confirm(input: ConfirmPaymentInput): Promise<ProviderResult<ProviderPayment>>;
  cancel(input: CancelPaymentInput): Promise<ProviderResult<ProviderPayment>>;
  // 우리 orderId로 조회한다. 브라우저가 보낸 paymentKey를 믿지 않고, 우리 주문의 실제 결제를 본다.
  // 승인된 결제가 없으면 rejected + code "NOT_FOUND_PAYMENT"를 돌려준다.
  getPaymentByOrderId(orderId: string): Promise<ProviderResult<ProviderPayment>>;
}
