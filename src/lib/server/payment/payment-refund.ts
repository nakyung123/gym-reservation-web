import "server-only";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import type { PaymentProvider } from "@/lib/server/payment/payment-provider";

export type ResolvePaymentProvider = (name: string) => PaymentProvider;

export type RefundBeforeCancelResult =
  | { ok: true }
  | { ok: false; message: string };

// 결제된 예약을 취소하기 전에 PG 환불을 먼저 끝낸다.
// 순서: Payment=refund_pending → PG 취소 API → (호출자) 예약 취소 + Payment=refunded 한 트랜잭션.
// - 환불이 실패하면 예약은 그대로 둔다(돈은 그대로인데 예약만 사라지는 일을 막는다).
// - 멱등키가 결제마다 고정(refund-<결제 id>)이라, 다시 눌러도 PG가 두 번 환불하지 않는다.
// - 환불은 됐는데 예약 취소 트랜잭션이 실패하면 refund_pending이 남는다. 다시 취소하면 같은
//   멱등키로 PG가 같은 결과를 돌려주고 DB 취소가 이어진다. 정리 cron도 같은 경로로 처리한다.
export async function refundPaymentBeforeCancel(
  payment: Payment,
  resolveProvider: ResolvePaymentProvider,
): Promise<RefundBeforeCancelResult> {
  if (!payment.providerPaymentKey) {
    // paid인데 결제키가 없으면 데이터가 깨진 것이다. 조용히 넘기지 않는다.
    console.error("[payment refund] paid 결제에 providerPaymentKey가 없음", {
      paymentId: payment.id,
    });
    return {
      ok: false,
      message: "결제 정보가 올바르지 않아 환불할 수 없습니다. 고객센터에 문의해 주세요.",
    };
  }

  await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ["paid", "refund_pending"] } },
    data: { status: "refund_pending" },
  });

  let provider: PaymentProvider;
  try {
    provider = resolveProvider(payment.provider);
  } catch (error) {
    console.error("[payment refund] provider 설정 오류", {
      paymentId: payment.id,
      name: error instanceof Error ? error.name : typeof error,
    });
    return {
      ok: false,
      message: "환불 설정에 문제가 있어 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const result = await provider.cancel({
    paymentKey: payment.providerPaymentKey,
    cancelReason: "예약 취소",
    idempotencyKey: `refund-${payment.id}`,
  });

  if (!result.ok) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "refund_pending" },
      data: { failureReason: `refund:${result.code}`.slice(0, 200) },
    });
    return {
      ok: false,
      message:
        result.kind === "rejected"
          ? `환불이 거절되어 예약을 취소하지 못했습니다. (${result.message})`
          : "환불 처리가 지연되어 예약을 취소하지 못했습니다. 잠시 후 다시 취소해 주세요.",
    };
  }

  if (result.value.state !== "canceled") {
    return {
      ok: false,
      message: "환불이 아직 완료되지 않았습니다. 잠시 후 다시 취소해 주세요.",
    };
  }

  return { ok: true };
}
