import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";
import {
  buildSlotFullOutput,
  cancelReservationAsAdminInDb,
  closePaymentAndReleaseSlot,
  expireStalePayments,
  expireStalePaymentsBeforeRead,
  newReservationId,
  reserveSlot,
  ReservationSlotFullError,
  toDomainReservation,
  validateReservationCreation,
  type CreateReservationInput,
  type CreateReservationOutput,
} from "@/lib/server/db-reservation-repository";
import type {
  PaymentProvider,
  ProviderPayment,
} from "@/lib/server/payment/payment-provider";
import { getPaymentProviderByName } from "@/lib/server/payment/payment-config";
import type { ResolvePaymentProvider } from "@/lib/server/payment/payment-refund";
import { getReservationStartInstant } from "@/lib/reservation-rules";
import { PAYMENT_HOLD_TTL_MS, type PreparedPayment } from "@/lib/payment";
import { gymRepository } from "@/lib/gym-repository-provider";
import { notifyReservationEvent } from "@/lib/server/reservation-notify";
import type { Reservation } from "@/types/domain";

// 결제 흐름 (docs/payment-implementation-plan.md)
// [A] preparePaymentInDb: 슬롯 정원 1 선점 + Payment(pending)   — 우리 DB, 1 트랜잭션
// [B] 브라우저가 PG 결제창 진행                                    — 우리 통제 밖
// [C] confirmPaymentInDb: pending→confirming 선점 → PG 승인 → Payment(paid)+예약+락 — 1 트랜잭션
// 실패·만료는 슬롯을 반환하고, 결과를 모르는 상태(confirming)는 reconcilePayments가 PG 조회로 정리한다.

// confirming이 이 시간보다 오래 멈춰 있으면 원래 승인 요청은 끝났다고 보고 PG 조회로 정리한다.
// PG 승인 요청 타임아웃(10초)보다 충분히 길다.
const CONFIRMING_STALE_MS = 60_000;

// 늦게 온 승인을 환불하지 못해 사람이 환불해야 하는 결제의 안내. 처음 응답과 재요청 응답이 같은 문구를 쓴다.
const MANUAL_REFUND_MESSAGE =
  "예약 확정에 실패했습니다. 결제 취소가 지연되고 있으니 고객센터로 문의해 주세요.";

// 확정하지 않고 환불만 해야 하는 confirming 결제의 failureReason 접두사.
// - finalize-failed: 예약 확정에 실패했고, 사용자에게 "결제는 자동으로 취소될 예정" 이라고 안내했다.
// - slot-started: PG 승인이 끝났을 때 이미 이용 시각이 지나 예약을 만들 수 없다.
// 환불이 실패해 confirming으로 남으면 정리 작업은 PG가 승인 완료(done)라도 예약을 만들지 않고 환불만 다시 한다.
const REFUND_ONLY_REASONS = ["finalize-failed", "slot-started"] as const;
type RefundOnlyReason = (typeof REFUND_ONLY_REASONS)[number];

function refundOnlyReasonOf(failureReason: string | null): RefundOnlyReason | null {
  if (!failureReason) return null;
  return REFUND_ONLY_REASONS.find((reason) => failureReason.startsWith(reason)) ?? null;
}

function newOrderId(): string {
  // 토스 orderId 규칙: 영문·숫자·-·_·= 6~64자.
  return `ord_${randomUUID().replace(/-/g, "")}`;
}

class PaymentInProgressError extends Error {
  constructor() {
    super("payment-in-progress");
  }
}

// ── [A] 결제 준비 ────────────────────────────────────────────────────────────

export type PreparePaymentOutput =
  | { ok: true; payment: PreparedPayment }
  | Exclude<CreateReservationOutput, { ok: true }>
  | { ok: false; status: "in-progress"; message: string };

export async function preparePaymentInDb(
  input: CreateReservationInput & { now?: Date; provider: string },
): Promise<PreparePaymentOutput> {
  const now = input.now ?? new Date();

  // 만료된 선점을 먼저 정리해 정원을 돌려놓는다. 정리가 실패해도 이번 요청은 진행한다
  // (정리 대상은 다음 요청이나 cron이 다시 처리한다). 실패는 로그로 남긴다.
  try {
    await expireStalePayments({ now, limit: 20 });
  } catch (error) {
    console.error("[payment prepare] 만료 정리 실패", {
      name: error instanceof Error ? error.name : typeof error,
    });
  }

  // 가상계좌는 입금이 비동기라 이 결제 흐름에서 다루지 않는다. 화면에서 숨긴 것과 같은 규칙을 서버에서도 지킨다.
  if (input.draft.paymentMethod === "virtual-account") {
    return {
      ok: false,
      status: "rejected",
      message: "가상계좌는 지원하지 않습니다. 카드나 간편결제를 선택해 주세요.",
    };
  }

  const validated = await validateReservationCreation(input);
  if (!validated.ok) {
    return validated.output;
  }
  const { fullDraft, activeKey, slotKey } = validated.value;

  // 위 전역 정리는 오래된 순 20건까지만 푼다. 만료 선점이 그보다 많아도 이번 슬롯이 막히지 않게
  // 대상 슬롯의 만료 선점을 한 번 더 푼다.
  await expireStalePaymentsBeforeRead(
    { gymId: slotKey.gymId, sport: slotKey.sport, dates: [slotKey.date] },
    now,
    "payment prepare",
  );

  if (!Number.isInteger(fullDraft.price) || fullDraft.price <= 0) {
    return {
      ok: false,
      status: "rejected",
      message: "결제 금액이 올바르지 않습니다.",
    };
  }

  const orderId = newOrderId();
  const orderName =
    `${input.gym.name} ${fullDraft.sport} ${fullDraft.date} ${fullDraft.time}`.slice(0, 100);
  const expiresAt = new Date(now.getTime() + PAYMENT_HOLD_TTL_MS);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { holdKey: activeKey } });

      if (existing && existing.status === "confirming") {
        // 이전 결제의 승인이 진행 중이다. 새 결제를 만들면 이중 결제가 될 수 있다.
        throw new PaymentInProgressError();
      }

      if (existing) {
        // 같은 사용자가 같은 슬롯으로 다시 결제창을 연다(이전 창을 닫았거나 새로고침).
        // 이전 시도는 failed로 닫고 선점은 새 시도가 이어받는다(정원을 두 번 잡지 않는다).
        // 이전 orderId로 승인 요청이 와도 pending이 아니라 거절되고, PG 쪽은 승인 안 된 채 만료된다.
        // pending일 때만 닫는다. 위에서 읽은 뒤 승인 요청이 pending → confirming 선점을 먼저 커밋했으면
        // 바뀐 행이 0개다. 그때 덮어쓰면 PG 승인은 끝났는데 예약도 환불도 없는 결제가 남는다.
        const superseded = await tx.payment.updateMany({
          where: { id: existing.id, status: "pending" },
          data: { status: "failed", holdKey: null, failureReason: "superseded" },
        });
        if (superseded.count === 0) {
          throw new PaymentInProgressError();
        }
      } else {
        await reserveSlot(tx, slotKey);
      }

      await tx.payment.create({
        data: {
          id: orderId,
          userId: input.userId,
          gymId: fullDraft.gymId,
          sport: fullDraft.sport,
          date: fullDraft.date,
          time: fullDraft.time,
          people: input.draft.people ?? 1,
          phone: input.draft.phone ?? null,
          paymentMethod: input.draft.paymentMethod ?? null,
          amount: fullDraft.price,
          orderName,
          status: "pending",
          provider: input.provider,
          holdKey: activeKey,
          expiresAt,
        },
      });
    });
  } catch (error) {
    if (error instanceof ReservationSlotFullError) {
      return buildSlotFullOutput(error.key);
    }
    if (
      error instanceof PaymentInProgressError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      // P2002: 같은 슬롯 결제 준비가 동시에 두 번 들어와 holdKey UNIQUE에 걸렸다.
      return {
        ok: false,
        status: "in-progress",
        message: "같은 예약의 결제가 이미 진행 중입니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    throw error;
  }

  return {
    ok: true,
    payment: {
      orderId,
      amount: fullDraft.price,
      orderName,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// ── [C] 결제 승인 ────────────────────────────────────────────────────────────

export type ConfirmPaymentOutput =
  | { ok: true; status: "confirmed" | "already-confirmed"; reservation: Reservation }
  | {
      ok: false;
      status:
        | "not-found" // 결제 없음
        | "forbidden" // 다른 사용자의 결제
        | "amount-mismatch" // 결제 금액 위조·불일치
        | "expired" // 선점 시간 초과(PG 승인 안 함 → 돈 안 나감)
        | "not-pending" // 이미 실패·만료·취소된 결제
        | "processing" // 다른 요청이 승인 중이거나 PG 결과를 모름 → 나중에 정리됨
        | "rejected" // PG가 승인 거절
        | "refunded-after-failure" // 승인은 됐지만 예약 확정 실패 → 환불 완료
        | "refund-pending-after-failure" // 승인은 됐지만 예약 확정 실패 → 환불도 아직(정리 cron이 다시 환불)
        | "manual-refund-required"; // 닫힌 결제에 승인이 와서 환불했는데 실패 → 사람이 환불해야 함
      message: string;
    };

export async function confirmPaymentInDb({
  userId,
  orderId,
  paymentKey,
  amount,
  provider,
  now = new Date(),
}: {
  userId: string;
  orderId: string;
  paymentKey: string;
  amount: number;
  provider: PaymentProvider;
  now?: Date;
}): Promise<ConfirmPaymentOutput> {
  const payment = await prisma.payment.findUnique({ where: { id: orderId } });
  if (!payment) {
    return { ok: false, status: "not-found", message: "결제 정보를 찾을 수 없습니다." };
  }
  if (payment.userId !== userId) {
    return { ok: false, status: "forbidden", message: "다른 사용자의 결제입니다." };
  }

  // 같은 승인 요청을 다시 보낸 경우(새로고침 등): 이미 확정된 예약을 그대로 돌려준다.
  // 결제키는 비교하지 않는다. 확정 때 PG가 돌려준 키로 바꿔 저장하므로 브라우저가 처음 보낸 키와 다를 수 있다.
  // 본인 결제(위 userId 검사)이고 이미 paid라 PG를 다시 부르지 않으므로, 키가 달라도 돌려줄 수 있다.
  if (payment.status === "paid") {
    const reservation = payment.reservationId
      ? await prisma.reservation.findUnique({ where: { id: payment.reservationId } })
      : null;
    if (reservation) {
      return {
        ok: true,
        status: "already-confirmed",
        reservation: toDomainReservation(reservation),
      };
    }
  }

  if (payment.status === "confirming") {
    // 원래 승인 요청이 끝났을 만큼 오래 멈춰 있으면, 정리 cron을 기다리지 않고 이 한 건을 바로 PG 조회로 정리한다.
    if (payment.updatedAt.getTime() <= now.getTime() - CONFIRMING_STALE_MS) {
      const settled = await settleStuckConfirming(payment, provider, now);
      if (settled.output) return settled.output;
    }
    return {
      ok: false,
      status: "processing",
      message: "결제 승인 결과를 확인하고 있습니다. 1분쯤 뒤 결과를 다시 확인해 주세요.",
    };
  }

  // 닫힌 결제에 늦게 온 승인을 환불하지 못해 사람이 환불해야 하는 결제. 새로고침으로 다시 와도
  // "다시 예약" 이 아니라 처음과 같은 고객센터 안내를 돌려준다(다시 결제하지 않게).
  // 닫힌 상태(failed·expired)일 때만 본다. 사람이 환불을 마쳐 refunded 로 바꾼 뒤에는 안내하지 않는다.
  if (
    (payment.status === "failed" || payment.status === "expired") &&
    payment.failureReason?.startsWith("late-approval-refund-failed")
  ) {
    return {
      ok: false,
      status: "manual-refund-required",
      message: MANUAL_REFUND_MESSAGE,
    };
  }

  // 예약이 있었던 환불 결제는 예약이 취소됐을 수도, 환불만 끝나고 이용 완료로 남았을 수도 있어 내 예약을 보게 한다.
  if (payment.status === "refunded") {
    return {
      ok: false,
      status: "not-pending",
      message: payment.reservationId
        ? "이미 환불된 결제입니다. 내 예약에서 상태를 확인해 주세요."
        : "이미 환불된 결제입니다. 예약은 진행되지 않았습니다.",
    };
  }

  // 결제한 예약의 취소(환불)가 진행 중이다. 예약이 남아 있으므로 "다시 예약" 으로 안내하지 않는다.
  if (payment.status === "refund_pending") {
    return {
      ok: false,
      status: "not-pending",
      message: "환불이 진행 중인 결제입니다. 내 예약에서 상태를 확인해 주세요.",
    };
  }

  if (payment.status !== "pending") {
    return {
      ok: false,
      status: "not-pending",
      message: "이미 종료된 결제입니다. 예약을 다시 진행해 주세요.",
    };
  }

  // 금액은 우리가 저장한 값만 믿는다. 브라우저가 보낸 금액이 다르면 PG에 승인 요청을 보내지 않는다.
  if (amount !== payment.amount) {
    await closePaymentAndReleaseSlot(payment.id, "pending", "failed", "amount-mismatch");
    return {
      ok: false,
      status: "amount-mismatch",
      message: "결제 금액이 일치하지 않아 결제를 진행하지 않았습니다.",
    };
  }

  if (payment.expiresAt.getTime() <= now.getTime()) {
    await closePaymentAndReleaseSlot(payment.id, "pending", "expired", "hold-expired");
    return {
      ok: false,
      status: "expired",
      message: "결제 가능 시간이 지났습니다. 결제는 승인되지 않았으니 예약을 다시 진행해 주세요.",
    };
  }

  // pending → confirming 선점. 동시에 들어온 승인 요청·만료 정리 중 하나만 통과한다.
  let claimed: Prisma.BatchPayload;
  try {
    claimed = await prisma.payment.updateMany({
      where: { id: payment.id, status: "pending", expiresAt: { gt: now } },
      data: { status: "confirming", providerPaymentKey: paymentKey },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // 같은 paymentKey가 다른 결제에 이미 쓰였다. 정상 흐름에서는 생기지 않는다.
      return {
        ok: false,
        status: "rejected",
        message: "결제 정보가 올바르지 않습니다.",
      };
    }
    throw error;
  }
  if (claimed.count === 0) {
    // 다른 승인 요청이 먼저 선점했거나 결제가 닫혔다. 예약이 아직 없을 수 있어 내 예약으로 보내지 않는다.
    return {
      ok: false,
      status: "processing",
      message: "결제 상태가 바뀌었습니다. 잠시 뒤 결과를 다시 확인해 주세요.",
    };
  }

  const result = await provider.confirm({
    paymentKey,
    orderId: payment.id,
    amount: payment.amount,
    idempotencyKey: `confirm-${payment.id}`,
  });

  if (!result.ok) {
    if (result.kind === "rejected") {
      await closePaymentAndReleaseSlot(
        payment.id,
        "confirming",
        "failed",
        `confirm:${result.code}`,
      );
      return {
        ok: false,
        status: "rejected",
        message: `결제가 승인되지 않았습니다. (${result.message})`,
      };
    }
    // 결과를 모른다. confirming으로 남겨 두면 reconcilePayments가 PG 조회로 정리한다.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "confirming" },
      data: { failureReason: `confirm:${result.code}`.slice(0, 200) },
    });
    return {
      ok: false,
      status: "processing",
      message: "결제 승인 결과를 아직 받지 못했습니다. 1분쯤 뒤 결과를 다시 확인해 주세요.",
    };
  }

  return finalizeConfirmedPayment(payment.id, result.value, provider, now);
}

// PG 승인이 끝난 결제를 예약으로 확정한다. 승인 직후와 재처리(reconcile)가 함께 쓴다.
// 확정에 실패하면 돈만 빠져나간 상태가 되므로 즉시 PG 취소(환불)를 시도한다.
export async function finalizeConfirmedPayment(
  paymentId: string,
  providerPayment: ProviderPayment,
  provider: PaymentProvider,
  now: Date = new Date(),
): Promise<ConfirmPaymentOutput> {
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (current.status !== "confirming" || !current.holdKey) {
        throw new FinalizeStateError(current.status);
      }
      // PG 응답이 다른 주문의 결제다. 그 결제는 우리 것이 아닐 수 있으므로 취소를 보내지 않는다.
      if (providerPayment.orderId !== current.id) {
        throw new FinalizeOrderMismatchError();
      }
      // 우리 주문은 맞는데 승인 상태·금액이 다르다. 돈이 나갔을 수 있으므로 환불한다.
      if (providerPayment.state !== "done" || providerPayment.totalAmount !== current.amount) {
        throw new FinalizeMismatchError();
      }
      // 이용 시각이 이미 지났으면 예약을 만들지 않고 환불한다(지난 예약은 사용자가 취소할 수도 없다).
      // 날짜·시각을 읽을 수 없는 경우도 예약을 만들지 않는다.
      const startsAt = getReservationStartInstant(current.date, current.time);
      if (!startsAt || startsAt.getTime() <= now.getTime()) {
        throw new SlotStartedError();
      }

      const reservationId = newReservationId();
      const created = await tx.reservation.create({
        data: {
          id: reservationId,
          userId: current.userId,
          gymId: current.gymId,
          sport: current.sport,
          date: current.date,
          time: current.time,
          price: current.amount,
          status: "reserved",
          paymentMethod: current.paymentMethod,
          phone: current.phone,
          activeKey: current.holdKey,
        },
      });
      // 슬롯 정원은 [A]에서 이미 잡았다. 여기서는 락만 만든다(같은 사용자 중복 예약 차단).
      await tx.reservationLock.create({
        data: { activeKey: current.holdKey, reservationId, status: "reserved" },
      });
      await tx.payment.update({
        where: { id: current.id },
        data: {
          status: "paid",
          holdKey: null,
          reservationId,
          // 이후 환불은 브라우저가 보낸 값이 아니라 PG가 승인 응답으로 돌려준 결제키를 쓴다.
          providerPaymentKey: providerPayment.paymentKey,
          paidAt: new Date(),
          failureReason: null,
        },
      });
      return created;
    });
    return { ok: true, status: "confirmed", reservation: toDomainReservation(reservation) };
  } catch (error) {
    if (error instanceof FinalizeStateError) {
      // paid·refund_pending: 다른 경로가 이미 예약을 확정했다. 돈과 예약이 맞으므로 그대로 둔다.
      if (error.status === "paid" || error.status === "refund_pending") {
        return {
          ok: false,
          status: "processing",
          message: "결제 상태가 바뀌었습니다. 내 예약에서 결과를 확인해 주세요.",
        };
      }
      // refunded: 다른 경로가 이미 환불했다. PG 에 취소를 다시 보내지 않는다(보상 경로와 같은 처리).
      if (error.status === "refunded") {
        return {
          ok: false,
          status: "processing",
          message: "결제 상태가 바뀌었습니다. 잠시 뒤 결과를 다시 확인해 주세요.",
        };
      }
      // 그 밖의 상태(failed·expired 등): PG는 승인했는데 결제가 이미 닫혀 예약이 없다. 돈만 나간 상태라 환불한다.
      return refundLateApproval(paymentId, error.status, providerPayment, provider);
    }
    if (error instanceof FinalizeOrderMismatchError) {
      // confirming으로 남겨 둔다. 정리 작업이 우리 orderId로 다시 조회해 실제 상태로 처리한다.
      console.error("[payment finalize] PG 응답의 orderId가 결제와 다름, 취소하지 않음", {
        paymentId,
      });
      await prisma.payment.updateMany({
        where: { id: paymentId, status: "confirming" },
        data: { failureReason: "provider-order-mismatch" },
      });
      return {
        ok: false,
        status: "processing",
        message: "결제 정보를 확인하고 있습니다. 1분쯤 뒤 결과를 다시 확인해 주세요.",
      };
    }
    if (error instanceof SlotStartedError) {
      return compensateFailedFinalize(paymentId, providerPayment, provider, "slot-started");
    }
    console.error("[payment finalize] 예약 확정 실패, 환불 시도", {
      paymentId,
      name: error instanceof Error ? error.name : typeof error,
      code:
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return compensateFailedFinalize(paymentId, providerPayment, provider, "finalize-failed");
  }
}

class FinalizeStateError extends Error {
  constructor(readonly status: string) {
    super("payment-finalize-state");
  }
}

class FinalizeOrderMismatchError extends Error {
  constructor() {
    super("payment-finalize-order-mismatch");
  }
}

class FinalizeMismatchError extends Error {
  constructor() {
    super("payment-finalize-mismatch");
  }
}

class SlotStartedError extends Error {
  constructor() {
    super("payment-finalize-slot-started");
  }
}

// PG 승인이 끝났는데 DB 결제가 이미 닫혀 있다(정원은 닫은 쪽이 이미 돌려줬다). 승인된 돈을 환불한다.
// 멱등키는 다른 환불 경로와 같은 refund-<결제 id>라 두 번 환불되지 않는다.
async function refundLateApproval(
  paymentId: string,
  closedStatus: string,
  providerPayment: ProviderPayment,
  provider: PaymentProvider,
): Promise<ConfirmPaymentOutput> {
  console.error("[payment finalize] 닫힌 결제에 PG 승인이 와서 환불함", {
    paymentId,
    closedStatus,
  });
  const refund = await provider.cancel({
    paymentKey: providerPayment.paymentKey,
    cancelReason: "결제 확정 실패",
    idempotencyKey: `refund-${paymentId}`,
  });

  if (refund.ok && refund.value.state === "canceled") {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: closedStatus },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        failureReason: "late-approval-refunded",
      },
    });
    return {
      ok: false,
      status: "refunded-after-failure",
      message: "예약을 확정하지 못해 결제를 취소했습니다. 다시 예약해 주세요.",
    };
  }

  // 환불도 실패했다. 이 결제는 정리 cron 대상(confirming·refund_pending)이 아니므로 사람이 처리해야 한다.
  const code = refund.ok ? "not-canceled" : refund.code;
  console.error("[payment finalize] 닫힌 결제의 환불 실패, 수동 환불 필요", {
    paymentId,
    closedStatus,
    code,
  });
  await prisma.payment.updateMany({
    where: { id: paymentId, status: closedStatus },
    data: { failureReason: `late-approval-refund-failed:${code}`.slice(0, 200) },
  });
  return {
    ok: false,
    status: "manual-refund-required",
    message: MANUAL_REFUND_MESSAGE,
  };
}

const COMPENSATE_MESSAGES: Record<
  RefundOnlyReason,
  { cancelReason: string; refunded: string; refundPending: string }
> = {
  "finalize-failed": {
    cancelReason: "예약 확정 실패",
    refunded: "예약을 확정하지 못해 결제를 취소했습니다. 다시 예약해 주세요.",
    refundPending:
      "예약 확정에 실패했습니다. 결제는 자동으로 취소될 예정입니다. 문제가 계속되면 문의해 주세요.",
  },
  "slot-started": {
    cancelReason: "이용 시간 경과",
    refunded: "이용 시간이 지나 예약을 확정하지 않고 결제를 취소했습니다.",
    refundPending:
      "이용 시간이 지나 예약을 확정하지 않았습니다. 결제는 자동으로 취소될 예정입니다. 문제가 계속되면 문의해 주세요.",
  },
};

// 승인된 돈을 예약 없이 환불한다. 환불이 실패하면 confirming으로 남기고 reason을 기록한다.
// 정리 작업은 이 reason을 보고 예약을 만들지 않고 환불만 다시 시도한다(REFUND_ONLY_REASONS).
async function compensateFailedFinalize(
  paymentId: string,
  providerPayment: ProviderPayment,
  provider: PaymentProvider,
  reason: RefundOnlyReason,
): Promise<ConfirmPaymentOutput> {
  // 환불 전에 상태를 다시 읽는다. 겹친 다른 확정이 먼저 paid로 만들었으면 돈과 예약이 맞으므로 취소하지 않는다.
  const current = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { status: true },
  });
  if (!current || current.status !== "confirming") {
    const status = current?.status ?? "missing";
    if (status === "paid" || status === "refund_pending") {
      return {
        ok: false,
        status: "processing",
        message: "결제 상태가 바뀌었습니다. 내 예약에서 결과를 확인해 주세요.",
      };
    }
    // refunded: 다른 경로가 이미 환불했다. 예약이 없을 수 있어 내 예약으로 보내지 않는다.
    if (status === "refunded") {
      return {
        ok: false,
        status: "processing",
        message: "결제 상태가 바뀌었습니다. 잠시 뒤 결과를 다시 확인해 주세요.",
      };
    }
    return refundLateApproval(paymentId, status, providerPayment, provider);
  }

  const messages = COMPENSATE_MESSAGES[reason];
  const refund = await provider.cancel({
    paymentKey: providerPayment.paymentKey,
    cancelReason: messages.cancelReason,
    idempotencyKey: `refund-${paymentId}`,
  });

  if (refund.ok && refund.value.state === "canceled") {
    await closePaymentAndReleaseSlot(paymentId, "confirming", "refunded", reason);
    return { ok: false, status: "refunded-after-failure", message: messages.refunded };
  }

  // 환불도 실패: confirming으로 남겨 reconcilePayments가 환불만 다시 시도한다.
  await prisma.payment.updateMany({
    where: { id: paymentId, status: "confirming" },
    data: {
      failureReason: `${reason}:${refund.ok ? "not-canceled" : refund.code}`.slice(0, 200),
    },
  });
  return { ok: false, status: "refund-pending-after-failure", message: messages.refundPending };
}

// ── 결제창 실패/취소 ─────────────────────────────────────────────────────────

export type FailPaymentOutput =
  | { ok: true; status: "failed" | "unchanged" }
  | { ok: false; status: "not-found" | "forbidden"; message: string };

export async function failPaymentInDb({
  userId,
  orderId,
  code,
}: {
  userId: string;
  orderId: string;
  code: string;
}): Promise<FailPaymentOutput> {
  const payment = await prisma.payment.findUnique({ where: { id: orderId } });
  if (!payment) {
    return { ok: false, status: "not-found", message: "결제 정보를 찾을 수 없습니다." };
  }
  if (payment.userId !== userId) {
    return { ok: false, status: "forbidden", message: "다른 사용자의 결제입니다." };
  }
  const changed = await closePaymentAndReleaseSlot(
    payment.id,
    "pending",
    "failed",
    `window:${code}`,
  );
  return { ok: true, status: changed ? "failed" : "unchanged" };
}

// ── 만료 정리 / 재처리 ───────────────────────────────────────────────────────

type SettleOutcome =
  | "confirmed"
  | "refunded"
  | "failed"
  | "still-pending"
  | "skipped" // 다른 요청·cron이 이미 처리 중이거나 처리했다
  | "error";

// 결과를 모르는 채 멈춘 confirming 결제 한 건을 PG 조회로 끝낸다. 정리 cron과 사용자의 재확인이 함께 쓴다.
// 1. 선점: confirming이고 1분 넘게 멈춘 경우에만 updatedAt을 now로 바꾼다. 동시에 같은 결제를 처리하려는
//    다른 요청은 0행이 되어 건너뛴다. 두 곳이 겹쳐 확정하면 두 번째가 UNIQUE 충돌로 환불 경로에 빠져,
//    예약은 남는데 돈은 환불되는 일이 생길 수 있다.
// 2. 조회: 브라우저가 보낸 paymentKey가 아니라 우리 orderId로 조회한다. 다른 주문의 결제를 건드리지 않는다.
async function settleStuckConfirming(
  payment: Payment,
  provider: PaymentProvider,
  now: Date,
): Promise<{ outcome: SettleOutcome; output: ConfirmPaymentOutput | null }> {
  const claimed = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: "confirming",
      updatedAt: { lte: new Date(now.getTime() - CONFIRMING_STALE_MS) },
    },
    data: { updatedAt: now },
  });
  if (claimed.count === 0) return { outcome: "skipped", output: null };

  const found = await provider.getPaymentByOrderId(payment.id);
  if (!found.ok) {
    if (found.kind === "rejected" && found.code === "NOT_FOUND_PAYMENT") {
      // 우리 주문으로 승인된 결제가 없다. 승인은 우리 서버만 보낼 수 있으므로 돈이 나가지 않았다.
      const closed = await closePaymentAndReleaseSlot(
        payment.id,
        "confirming",
        "failed",
        "reconcile:not-found",
      );
      return closed
        ? { outcome: "failed", output: NOT_APPROVED_OUTPUT }
        : { outcome: "skipped", output: null };
    }
    return { outcome: "error", output: null };
  }

  const providerPayment = found.value;
  if (providerPayment.state === "done") {
    const refundOnly = refundOnlyReasonOf(payment.failureReason);
    const output = refundOnly
      ? await compensateFailedFinalize(payment.id, providerPayment, provider, refundOnly)
      : await finalizeConfirmedPayment(payment.id, providerPayment, provider, now);
    if (output.ok) return { outcome: "confirmed", output };
    if (output.status === "refunded-after-failure") return { outcome: "refunded", output };
    // processing: 처리 중에 결제 상태가 바뀌었다. 다른 경로가 이미 끝냈으면(confirming 이 아님) 건너뛴 것으로 센다.
    // 그대로 confirming 이면(orderId 불일치 등) 다음 실행이 다시 처리해야 하므로 오류로 센다.
    // manual-refund-required 같은 다른 실패는 사람이 봐야 하므로 오류로 센다.
    if (output.status === "processing") {
      const after = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (after && after.status !== "confirming") return { outcome: "skipped", output };
    }
    return { outcome: "error", output };
  }
  if (providerPayment.state === "in-progress") {
    return { outcome: "still-pending", output: null };
  }

  // 승인 안 됨(not-approved) 또는 이미 취소됨(canceled): 돈이 나가 있지 않다.
  const canceled = providerPayment.state === "canceled";
  const closed = await closePaymentAndReleaseSlot(
    payment.id,
    "confirming",
    canceled ? "refunded" : "failed",
    `reconcile:${providerPayment.state}`,
  );
  if (!closed) return { outcome: "skipped", output: null };
  return { outcome: canceled ? "refunded" : "failed", output: NOT_APPROVED_OUTPUT };
}

const NOT_APPROVED_OUTPUT: ConfirmPaymentOutput = {
  ok: false,
  status: "rejected",
  message: "결제가 승인되지 않아 예약이 진행되지 않았습니다. 예약을 다시 진행해 주세요.",
};

export type ReconcileSummary = {
  expired: number;
  confirmed: number;
  failed: number;
  refunded: number;
  stillPending: number;
  // 다른 요청(사용자의 결과 재확인, 겹친 정리 실행)이 이미 처리 중이거나 처리해서 건너뛴 건.
  skipped: number;
  // 처리 시간 한도를 넘어 이번 실행에서 손대지 않은 건. 다음 실행이 처리한다.
  deferred: number;
  errors: number;
};

// 한 번 실행에서 쓸 수 있는 시간. Vercel 함수 한도(maxDuration 300초) 안에서 끝내기 위해 둔다.
// PG 호출 하나가 최대 10초(취소 재확인은 20초)라, 한도를 넘기 전에 새 건을 시작하지 않는다.
const RECONCILE_TIME_BUDGET_MS = 240_000;

// 정리 cron이 호출한다. 결과를 몰라 남아 있는 결제를 PG 조회로 끝까지 처리한다.
// - pending 만료 → expired + 정원 반환
// - confirming(1분 이상 멈춤) → settleStuckConfirming
// - refund_pending → 예약 취소를 다시 실행(같은 멱등키로 환불 → 예약 취소)
export async function reconcilePayments({
  now = new Date(),
  resolveProvider = getPaymentProviderByName,
  limit = 50,
  timeBudgetMs = RECONCILE_TIME_BUDGET_MS,
  clock = () => Date.now(),
  notifyCancelled = notifyCancelledByReconcile,
}: {
  now?: Date;
  resolveProvider?: ResolvePaymentProvider;
  limit?: number;
  timeBudgetMs?: number;
  clock?: () => number;
  // 환불 대기 건을 끝내 예약이 실제로 취소됐을 때 부른다. 사용자 취소 경로와 같은 취소 알림을 보낸다.
  notifyCancelled?: (reservation: Reservation) => Promise<void>;
} = {}): Promise<ReconcileSummary> {
  const startedAt = clock();
  const overBudget = () => clock() - startedAt >= timeBudgetMs;
  // 결제 한 건을 처리하는 시점의 시각. 실행 시작 시각을 계속 쓰면, 시간이 지난 뒤 선점한 결제의
  // updatedAt이 이미 "1분 넘게 멈춤" 이 되어 사용자의 재확인이 같은 결제를 다시 선점할 수 있다.
  const currentNow = () => new Date(now.getTime() + (clock() - startedAt));
  const summary: ReconcileSummary = {
    expired: await expireStalePayments({ now, limit }),
    confirmed: 0,
    failed: 0,
    refunded: 0,
    stillPending: 0,
    skipped: 0,
    deferred: 0,
    errors: 0,
  };

  const stuck = await prisma.payment.findMany({
    where: {
      status: "confirming",
      updatedAt: { lte: new Date(now.getTime() - CONFIRMING_STALE_MS) },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  for (const payment of stuck) {
    if (overBudget()) {
      summary.deferred += 1;
      continue;
    }
    try {
      const provider = resolveProvider(payment.provider);
      const { outcome } = await settleStuckConfirming(payment, provider, currentNow());
      switch (outcome) {
        case "confirmed":
          summary.confirmed += 1;
          break;
        case "refunded":
          summary.refunded += 1;
          break;
        case "failed":
          summary.failed += 1;
          break;
        case "still-pending":
          summary.stillPending += 1;
          break;
        case "skipped":
          summary.skipped += 1;
          break;
        case "error":
          summary.errors += 1;
          break;
      }
    } catch (error) {
      summary.errors += 1;
      console.error("[payment reconcile] confirming 처리 실패", {
        paymentId: payment.id,
        name: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  const refundPending = await prisma.payment.findMany({
    where: { status: "refund_pending", reservationId: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true, reservationId: true },
  });
  for (const payment of refundPending) {
    if (overBudget()) {
      summary.deferred += 1;
      continue;
    }
    try {
      const result = await cancelReservationAsAdminInDb(payment.reservationId!, {
        resolvePaymentProvider: resolveProvider,
      });
      if (result.ok) {
        summary.refunded += 1;
        if (result.status === "cancelled") {
          // 알림은 부수효과다. 실패해도 정리 결과를 바꾸지 않는다.
          try {
            await notifyCancelled(result.reservation);
          } catch (error) {
            console.error("[payment reconcile] 취소 알림 실패(정리 결과엔 영향 없음)", {
              paymentId: payment.id,
              name: error instanceof Error ? error.name : typeof error,
            });
          }
        }
      } else {
        // 예약이 이미 이용 완료면 취소는 안 되지만 환불은 끝내고 결제를 닫는다. 결제가 닫혔으면 처리된 것이다.
        const after = await prisma.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        if (after?.status === "refunded") summary.refunded += 1;
        else summary.errors += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error("[payment reconcile] refund_pending 처리 실패", {
        paymentId: payment.id,
        name: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  return summary;
}

// 정리 cron이 예약을 취소했을 때의 기본 알림. 사용자 취소 route와 같이 시설명을 찾아 보내고,
// 못 찾으면 gymId로 대신한다.
async function notifyCancelledByReconcile(reservation: Reservation): Promise<void> {
  let gymName = reservation.gymId;
  try {
    const gym = await gymRepository.findById(reservation.gymId);
    if (gym) gymName = gym.name;
  } catch (error) {
    console.error("[payment reconcile] 시설명 조회 실패(알림 라벨 대신 gymId)", {
      name: error instanceof Error ? error.name : typeof error,
    });
  }
  await notifyReservationEvent({
    kind: "cancelled",
    gymName,
    sport: reservation.sport,
    date: reservation.date,
    time: reservation.time,
  });
}
