// 결제 관련 공유 타입과 응답 type guard. 서버·클라이언트 모두 import할 수 있다(server-only 아님).

// 결제창을 띄운 뒤 승인되지 않으면 슬롯 선점을 풀어 주는 시간.
export const PAYMENT_HOLD_TTL_MS = 15 * 60 * 1000;

// 서버가 화면에 내려주는 결제 설정.
export type PublicPaymentConfig =
  | { mode: "none" }
  | { mode: "toss"; clientKey: string };

// POST /api/payments/prepare 성공 응답.
export type PreparedPayment = {
  orderId: string;
  amount: number;
  orderName: string;
  expiresAt: string;
};

export function isPreparedPayment(value: unknown): value is PreparedPayment {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.orderId === "string" &&
    typeof record.amount === "number" &&
    typeof record.orderName === "string" &&
    typeof record.expiresAt === "string"
  );
}
