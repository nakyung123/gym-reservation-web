import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmPaymentInDb,
  failPaymentInDb,
  preparePaymentInDb,
  reconcilePayments,
} from "@/lib/server/db-payment-repository";
import {
  cancelReservationAsAdminInDb,
  cancelReservationInDb,
  createReservationInDb,
  listReservationSlotAvailabilities,
  markReservationUsedInDb,
  updateReservationSlotPolicies,
  updateReservationSlotPolicy,
} from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { computeReservationPrice } from "@/lib/sport-capacity";
import { PAYMENT_HOLD_TTL_MS } from "@/lib/payment";
import { TEST_GYM, futureDate } from "@tests/setup-db";
import {
  createFakePaymentProvider,
  REJECTED_FAILURE,
  UNKNOWN_FAILURE,
  type FakePaymentProvider,
} from "@tests/fake-payment-provider";

// 정리 cron 의 기본 취소 알림이 실제 Slack 으로 나가지 않게 한다. 로컬 설정(SLACK_WEBHOOK_URL)에 따라
// 결과가 달라지지 않게 하기 위해서다. 알림을 검사하는 테스트는 notifyCancelled 를 직접 넘긴다.
vi.mock("@/lib/server/reservation-notify", () => ({ notifyReservationEvent: vi.fn() }));

const userA = "pay-user-a";
const userB = "pay-user-b";

let fake: FakePaymentProvider;

beforeEach(() => {
  fake = createFakePaymentProvider();
});

function draft(time = "10:00", people?: number) {
  return {
    gymId: TEST_GYM.id,
    sport: "배드민턴" as const,
    date: futureDate(),
    time,
    people,
    paymentMethod: "card" as const,
    phone: null,
  };
}

async function prepare(userId = userA, time = "10:00", now?: Date) {
  const result = await preparePaymentInDb({
    userId,
    draft: draft(time),
    gym: TEST_GYM,
    provider: "toss",
    now,
  });
  if (!result.ok) throw new Error(`prepare 실패: ${result.status}`);
  return result.payment;
}

async function reservedCount(time = "10:00") {
  const slot = await prisma.reservationSlot.findUnique({
    where: {
      gymId_sport_date_time: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time,
      },
    },
  });
  return slot?.reservedCount ?? 0;
}

async function prepareAndConfirm(userId = userA) {
  const prepared = await prepare(userId);
  const result = await confirmPaymentInDb({
    userId,
    orderId: prepared.orderId,
    paymentKey: `pk_${prepared.orderId}`,
    amount: prepared.amount,
    provider: fake,
  });
  if (!result.ok) throw new Error(`confirm 실패: ${result.status}`);
  return { prepared, reservation: result.reservation };
}

describe("preparePaymentInDb", () => {
  it("슬롯 정원 1을 선점하고 pending 결제를 만든다. 예약은 아직 없다", async () => {
    const prepared = await prepare();

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("pending");
    expect(payment.holdKey).not.toBeNull();
    expect(await reservedCount()).toBe(1);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("금액은 서버가 단가 × 인원으로 계산한다", async () => {
    const result = await preparePaymentInDb({
      userId: userA,
      draft: draft("10:00", 2),
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payment.amount).toBe(computeReservationPrice(TEST_GYM, "배드민턴", 2));
    expect(result.payment.orderId).toMatch(/^[A-Za-z0-9_=-]{6,64}$/);
  });

  it("같은 슬롯을 다시 준비하면 이전 시도를 닫고 선점을 이어받는다(정원을 두 번 잡지 않음)", async () => {
    const first = await prepare();
    const second = await prepare();

    expect(second.orderId).not.toBe(first.orderId);
    const old = await prisma.payment.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(old.status).toBe("failed");
    expect(old.holdKey).toBeNull();
    expect(await reservedCount()).toBe(1);
  });

  it("승인 처리 중인 결제가 있으면 새 결제를 만들지 않는다", async () => {
    const first = await prepare();
    await prisma.payment.update({ where: { id: first.orderId }, data: { status: "confirming" } });

    const result = await preparePaymentInDb({
      userId: userA,
      draft: draft(),
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("in-progress");
    expect(await prisma.payment.count()).toBe(1);
  });

  it("prepare 가 pending 을 읽은 뒤 승인 선점이 먼저 커밋되면, 승인 중인 결제를 덮어쓰지 않고 거절한다", async () => {
    const first = await prepare();

    // 승인 요청(confirm)의 pending → confirming 선점을 흉내 낸다.
    // 행을 바꾸고 커밋하지 않은 채 기다려, prepare 가 "pending 을 읽고 → update 에서 대기" 하게 만든다.
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let commitClaim!: () => void;
    const claimCommitted = new Promise<void>((resolve) => (commitClaim = resolve));
    const claim = prisma.$transaction(
      async (tx) => {
        await tx.payment.update({
          where: { id: first.orderId },
          data: { status: "confirming", providerPaymentKey: `pk_${first.orderId}` },
        });
        markLocked();
        await claimCommitted;
      },
      { timeout: 15_000 },
    );
    await locked;

    const second = preparePaymentInDb({
      userId: userA,
      draft: draft(),
      gym: TEST_GYM,
      provider: "toss",
    });

    // prepare 의 update 가 행 잠금에서 대기할 때까지 기다린다(순서를 매번 같게 만든다).
    const deadline = Date.now() + 10_000;
    for (;;) {
      const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (row.waiting > 0) break;
      if (Date.now() > deadline) throw new Error("prepare 가 행 잠금 대기에 들어가지 않았다");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    commitClaim();
    await claim;
    const result = await second;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("in-progress");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(payment.status).toBe("confirming");
    expect(payment.holdKey).not.toBeNull();
    expect(await prisma.payment.count()).toBe(1);
    expect(await reservedCount()).toBe(1);
  }, 30_000);

  it("정원이 찬 슬롯은 선점하지 않는다", async () => {
    await prisma.reservationSlot.create({
      data: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 1,
        reservedCount: 0,
      },
    });
    await prepare(userA);

    const result = await preparePaymentInDb({
      userId: userB,
      draft: draft(),
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("full");
    expect(await prisma.payment.count()).toBe(1);
  });

  it("운영자가 마감한 슬롯은 선점하지 않는다", async () => {
    await prisma.reservationSlot.create({
      data: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 10,
        reservedCount: 0,
        isClosed: true,
      },
    });

    const result = await preparePaymentInDb({
      userId: userA,
      draft: draft(),
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("full");
    expect(result.message).toContain("운영자에 의해 마감");
    expect(await prisma.payment.count()).toBe(0);
    expect(await reservedCount()).toBe(0);
  });

  it("결제 모드에서는 가상계좌 결제를 준비하지 않는다", async () => {
    const result = await preparePaymentInDb({
      userId: userA,
      draft: { ...draft(), paymentMethod: "virtual-account" },
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.payment.count()).toBe(0);
    expect(await reservedCount()).toBe(0);
  });

  it("만료된 다른 사용자의 선점은 준비 요청 때 정리되어 정원이 돌아온다", async () => {
    await prisma.reservationSlot.create({
      data: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 1,
        reservedCount: 0,
      },
    });
    const past = new Date(Date.now() - PAYMENT_HOLD_TTL_MS - 60_000);
    const stale = await prepare(userA, "10:00", past);

    await prepare(userB);
    const old = await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } });
    expect(old.status).toBe("expired");
    expect(await reservedCount()).toBe(1);
  });
});

describe("confirmPaymentInDb", () => {
  it("승인되면 예약·락이 생기고 결제는 paid가 된다. 정원은 선점분 1 그대로", async () => {
    const { prepared, reservation } = await prepareAndConfirm();

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("paid");
    expect(payment.reservationId).toBe(reservation.id);
    expect(payment.holdKey).toBeNull();
    expect(reservation.status).toBe("reserved");
    expect(reservation.price).toBe(prepared.amount);
    expect(await prisma.reservationLock.count()).toBe(1);
    expect(await reservedCount()).toBe(1);
    expect(fake.calls.confirm).toEqual([
      {
        paymentKey: `pk_${prepared.orderId}`,
        orderId: prepared.orderId,
        amount: prepared.amount,
        idempotencyKey: `confirm-${prepared.orderId}`,
      },
    ]);
  });

  it("같은 승인 요청을 두 번 보내도 예약은 1건이고 PG 승인은 한 번만 호출한다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();

    const again = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });
    expect(again).toMatchObject({ ok: true, status: "already-confirmed" });
    if (!again.ok) return;
    expect(again.reservation.id).toBe(reservation.id);
    expect(await prisma.reservation.count()).toBe(1);
    expect(fake.calls.confirm).toHaveLength(1);
  });

  it("동시에 들어온 승인 요청 두 개 중 하나만 PG에 승인을 보낸다", async () => {
    const prepared = await prepare();
    const input = {
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    };
    const results = await Promise.all([confirmPaymentInDb(input), confirmPaymentInDb(input)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(fake.calls.confirm).toHaveLength(1);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("금액이 다르면 PG에 보내지 않고 결제를 닫고 정원을 돌려준다", async () => {
    const prepared = await prepare();
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_x",
      amount: prepared.amount - 1000,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "amount-mismatch" });
    expect(fake.calls.confirm).toHaveLength(0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("failed");
    expect(await reservedCount()).toBe(0);
  });

  it("다른 사용자의 결제는 승인하지 않는다", async () => {
    const prepared = await prepare(userA);
    const result = await confirmPaymentInDb({
      userId: userB,
      orderId: prepared.orderId,
      paymentKey: "pk_x",
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "forbidden" });
    expect(fake.calls.confirm).toHaveLength(0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("pending");
  });

  it("선점 시간이 지나면 PG에 승인을 보내지 않는다(돈이 나가지 않음)", async () => {
    const prepared = await prepare();
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_x",
      amount: prepared.amount,
      provider: fake,
      now: new Date(Date.now() + PAYMENT_HOLD_TTL_MS + 1000),
    });

    expect(result).toMatchObject({ ok: false, status: "expired" });
    expect(fake.calls.confirm).toHaveLength(0);
    expect(await reservedCount()).toBe(0);
  });

  it("PG가 거절하면 결제를 failed로 닫고 정원을 돌려준다", async () => {
    const prepared = await prepare();
    fake.nextConfirm = REJECTED_FAILURE;
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_x",
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "rejected" });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("failed");
    expect(payment.holdKey).toBeNull();
    expect(await reservedCount()).toBe(0);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("PG 결과를 모르면 confirming으로 남기고 정원을 유지한다", async () => {
    const prepared = await prepare();
    fake.nextConfirm = UNKNOWN_FAILURE;
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_x",
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "processing" });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("confirming");
    expect(await reservedCount()).toBe(1);
  });

  it("승인 후 예약 확정이 실패하면 즉시 환불하고 정원을 돌려준다", async () => {
    const prepared = await prepare();
    // 결제 없는 경로로 같은 슬롯 예약을 먼저 만들어 두면 확정 단계의 락 INSERT가 충돌한다.
    const direct = await createReservationInDb({ userId: userA, draft: draft(), gym: TEST_GYM });
    expect(direct.ok).toBe(true);
    expect(await reservedCount()).toBe(2);

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "refunded-after-failure" });
    expect(fake.calls.cancel).toEqual([
      {
        paymentKey: `pk_${prepared.orderId}`,
        cancelReason: "예약 확정 실패",
        idempotencyKey: `refund-${prepared.orderId}`,
      },
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(await reservedCount()).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("PG 승인 중에 결제가 다른 경로로 닫히면, 승인된 돈을 환불한다", async () => {
    const prepared = await prepare();
    // PG 승인 응답이 오기 전에 결제가 failed 로 닫힌 상황(어떤 경로든)을 만든다.
    const confirmAtPg = fake.confirm;
    fake.confirm = async (input) => {
      const approved = await confirmAtPg(input);
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "failed", holdKey: null, failureReason: "test-closed" },
      });
      return approved;
    };

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "refunded-after-failure" });
    expect(fake.calls.cancel.map((call) => call.idempotencyKey)).toEqual([
      `refund-${prepared.orderId}`,
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAt).not.toBeNull();
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("PG 승인 중에 다른 경로가 예약을 먼저 확정했으면 환불하지 않는다", async () => {
    const prepared = await prepare();
    const confirmAtPg = fake.confirm;
    fake.confirm = async (input) => {
      const approved = await confirmAtPg(input);
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "paid", holdKey: null },
      });
      return approved;
    };

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "processing" });
    expect(fake.calls.cancel).toHaveLength(0);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("paid");
  });

  it("확정 실패 후 환불도 실패하면 confirming으로 남겨 재처리 대상으로 둔다", async () => {
    const prepared = await prepare();
    await createReservationInDb({ userId: userA, draft: draft(), gym: TEST_GYM });
    fake.nextCancel = UNKNOWN_FAILURE;

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "refund-pending-after-failure" });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("confirming");
  });
});

describe("결제된 예약 취소와 환불", () => {
  it("사용자가 취소하면 PG 환불 후 예약 취소, 결제 refunded, 정원 반환", async () => {
    const { prepared, reservation } = await prepareAndConfirm();

    const result = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });

    expect(result).toMatchObject({ ok: true, status: "cancelled" });
    expect(fake.calls.cancel).toEqual([
      {
        paymentKey: `pk_${prepared.orderId}`,
        cancelReason: "예약 취소",
        idempotencyKey: `refund-${prepared.orderId}`,
      },
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAt).not.toBeNull();
    expect(await reservedCount()).toBe(0);
  });

  it("환불이 실패하면 예약을 취소하지 않고 refund_pending으로 남긴다. 다시 취소하면 같은 멱등키로 끝난다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;

    const failed = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(failed).toMatchObject({ ok: false, status: "refund-failed" });
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("reserved");
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refund_pending");
    expect(await reservedCount()).toBe(1);

    const retried = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(retried).toMatchObject({ ok: true, status: "cancelled" });
    expect(fake.calls.cancel.map((call) => call.idempotencyKey)).toEqual([
      `refund-${prepared.orderId}`,
      `refund-${prepared.orderId}`,
    ]);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refunded");
    expect(await reservedCount()).toBe(0);
  });

  it("환불 대기 중인 예약은 이용 완료로 바꾸지 않는다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    await cancelReservationInDb(userA, reservation.id, { resolvePaymentProvider: () => fake });

    const result = await markReservationUsedInDb(reservation.id);

    expect(result).toMatchObject({ ok: false, status: "not-usable" });
    expect(result.message).toContain("환불");
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("reserved");
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refund_pending");
  });

  it("환불 대기인데 예약이 이미 이용 완료면, 정리 때 환불을 다시 시도하고 결제를 refunded 로 닫는다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    // 이용 완료 처리와 취소 요청이 겹쳐 생긴 상태를 직접 만든다.
    await prisma.payment.update({
      where: { id: prepared.orderId },
      data: { status: "refund_pending" },
    });
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "used" } });

    const summary = await reconcilePayments({ resolveProvider: () => fake });

    expect(summary).toMatchObject({ refunded: 1, errors: 0 });
    expect(fake.calls.cancel.map((call) => call.idempotencyKey)).toEqual([
      `refund-${prepared.orderId}`,
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAt).not.toBeNull();
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("used");

    // 다음 정리에서는 다시 처리할 것이 없다.
    const next = await reconcilePayments({ resolveProvider: () => fake });
    expect(next.errors).toBe(0);
    expect(fake.calls.cancel).toHaveLength(1);
  });

  it("환불 성공 직후 예약이 이용 완료로 바뀌면, 예약은 두고 결제를 refunded 로 닫는다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    // PG 환불 응답과 예약 취소 트랜잭션 사이에 관리자가 이용 완료로 바꾼 상황.
    const cancelAtPg = fake.cancel;
    fake.cancel = async (input) => {
      const refunded = await cancelAtPg(input);
      await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "used" } });
      return refunded;
    };

    const result = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });

    expect(result).toMatchObject({ ok: false, status: "not-cancellable" });
    expect(result.message).toContain("환불");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAt).not.toBeNull();
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("used");
  });

  it("관리자 취소도 환불을 거친다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();

    const result = await cancelReservationAsAdminInDb(reservation.id, {
      resolvePaymentProvider: () => fake,
    });

    expect(result).toMatchObject({ ok: true, status: "cancelled" });
    expect(fake.calls.cancel).toHaveLength(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refunded");
  });

  it("결제 없이 만든 예약 취소는 PG를 호출하지 않는다", async () => {
    const direct = await createReservationInDb({ userId: userA, draft: draft(), gym: TEST_GYM });
    if (!direct.ok) throw new Error("예약 생성 실패");

    const result = await cancelReservationInDb(userA, direct.reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(result).toMatchObject({ ok: true, status: "cancelled" });
    expect(fake.calls.cancel).toHaveLength(0);
  });
});

describe("failPaymentInDb", () => {
  it("결제창 실패를 기록하고 정원을 돌려준다. 다시 호출해도 한 번만 반환한다", async () => {
    const prepared = await prepare();

    const first = await failPaymentInDb({ userId: userA, orderId: prepared.orderId, code: "PAY_PROCESS_CANCELED" });
    const second = await failPaymentInDb({ userId: userA, orderId: prepared.orderId, code: "PAY_PROCESS_CANCELED" });

    expect(first).toEqual({ ok: true, status: "failed" });
    expect(second).toEqual({ ok: true, status: "unchanged" });
    expect(await reservedCount()).toBe(0);
  });

  it("다른 사용자의 결제는 닫지 않는다", async () => {
    const prepared = await prepare(userA);
    const result = await failPaymentInDb({ userId: userB, orderId: prepared.orderId, code: "X" });
    expect(result).toMatchObject({ ok: false, status: "forbidden" });
    expect(await reservedCount()).toBe(1);
  });
});

describe("reconcilePayments", () => {
  it("만료된 pending을 expired로 닫고 정원을 돌려준다", async () => {
    const prepared = await prepare();

    const summary = await reconcilePayments({
      now: new Date(Date.now() + PAYMENT_HOLD_TTL_MS + 1000),
      resolveProvider: () => fake,
    });

    expect(summary.expired).toBe(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("expired");
    expect(await reservedCount()).toBe(0);
  });

  it("결과를 모르던 confirming을 PG 조회로 확인해 승인됐으면 예약을 확정한다", async () => {
    const prepared = await prepare();
    fake.nextConfirm = UNKNOWN_FAILURE;
    await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_late",
      amount: prepared.amount,
      provider: fake,
    });
    // PG 쪽에서는 사실 승인이 끝나 있었다.
    fake.payments.set("pk_late", {
      paymentKey: "pk_late",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "done",
    });

    const summary = await reconcilePayments({
      now: new Date(Date.now() + 2 * 60_000),
      resolveProvider: () => fake,
    });

    expect(summary.confirmed).toBe(1);
    expect(summary.errors).toBe(0);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("paid");
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("confirming인데 PG에서 승인되지 않았으면 failed로 닫고 정원을 돌려준다", async () => {
    const prepared = await prepare();
    fake.nextConfirm = UNKNOWN_FAILURE;
    await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_aborted",
      amount: prepared.amount,
      provider: fake,
    });
    fake.payments.set("pk_aborted", {
      paymentKey: "pk_aborted",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "not-approved",
    });

    const summary = await reconcilePayments({
      now: new Date(Date.now() + 2 * 60_000),
      resolveProvider: () => fake,
    });

    expect(summary.failed).toBe(1);
    expect(await reservedCount()).toBe(0);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("refund_pending으로 남은 취소를 다시 실행해 끝낸다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    await cancelReservationInDb(userA, reservation.id, { resolvePaymentProvider: () => fake });

    const summary = await reconcilePayments({ resolveProvider: () => fake });

    expect(summary.refunded).toBe(1);
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("cancelled");
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refunded");
  });
});

// ── diff-review 반영 (2026-11-22): 결과를 모르는 승인(confirming)의 정리 ─────────────────

// PG 승인 결과를 모른 채 confirming으로 남은 결제를 만든다.
async function leaveConfirming(paymentKey: string, time = "10:00") {
  const prepared = await prepare(userA, time);
  fake.nextConfirm = UNKNOWN_FAILURE;
  const result = await confirmPaymentInDb({
    userId: userA,
    orderId: prepared.orderId,
    paymentKey,
    amount: prepared.amount,
    provider: fake,
  });
  expect(result).toMatchObject({ ok: false, status: "processing" });
  return prepared;
}

// PG 쪽에서는 사실 승인이 끝나 있었다고 둔다.
function approvedAtPg(paymentKey: string, orderId: string, amount: number) {
  fake.payments.set(paymentKey, { paymentKey, orderId, totalAmount: amount, state: "done" });
}

// 슬롯(futureDate 의 KST time) 시작 시각.
function slotStart(time = "10:00") {
  return new Date(`${futureDate()}T${time}:00+09:00`);
}

const twoMinutesLater = () => new Date(Date.now() + 2 * 60_000);

describe("결과를 모르는 승인의 정리", () => {
  it("이용 시각이 지난 뒤 승인 완료가 확인되면 예약을 만들지 않고 환불한다", async () => {
    const prepared = await leaveConfirming("pk_started");
    approvedAtPg("pk_started", prepared.orderId, prepared.amount);

    const summary = await reconcilePayments({
      now: new Date(slotStart().getTime() + 60 * 60_000),
      resolveProvider: () => fake,
    });

    expect(summary).toMatchObject({ refunded: 1, confirmed: 0, errors: 0 });
    expect(fake.calls.cancel).toEqual([
      {
        paymentKey: "pk_started",
        cancelReason: "이용 시간 경과",
        idempotencyKey: `refund-${prepared.orderId}`,
      },
    ]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.failureReason).toBe("slot-started");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await reservedCount()).toBe(0);
  });

  it("PG 응답의 orderId가 우리 결제와 다르면 취소를 보내지 않고 confirming으로 남긴다", async () => {
    const prepared = await prepare();
    fake.nextConfirm = {
      ok: true,
      value: {
        paymentKey: "pk_other_order",
        orderId: "ord_someone_else",
        totalAmount: prepared.amount,
        state: "done",
      },
    };

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_other_order",
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "processing" });
    expect(fake.calls.cancel).toHaveLength(0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("confirming");
    expect(payment.failureReason).toBe("provider-order-mismatch");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("우리 orderId로 승인된 결제가 PG에 없으면(NOT_FOUND) failed로 닫고 정원을 돌려준다", async () => {
    const prepared = await leaveConfirming("pk_never_reached");

    const summary = await reconcilePayments({ now: twoMinutesLater(), resolveProvider: () => fake });

    expect(summary).toMatchObject({ failed: 1, errors: 0 });
    expect(fake.calls.getPaymentByOrderId).toEqual([prepared.orderId]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("failed");
    expect(payment.failureReason).toBe("reconcile:not-found");
    expect(await reservedCount()).toBe(0);
  });

  it("정리 작업 둘이 같은 결제를 동시에 처리하면 한 곳만 PG를 조회하고 예약은 1건이다", async () => {
    const prepared = await leaveConfirming("pk_race");
    approvedAtPg("pk_race", prepared.orderId, prepared.amount);
    fake.getPaymentDelayMs = 200;
    const now = twoMinutesLater();

    const [first, second] = await Promise.all([
      reconcilePayments({ now, resolveProvider: () => fake }),
      reconcilePayments({ now, resolveProvider: () => fake }),
    ]);

    expect(fake.calls.getPaymentByOrderId).toHaveLength(1);
    expect(first.confirmed + second.confirmed).toBe(1);
    // 선점하지 못한 쪽은 처리 중인 것으로 세지 않고 건너뛴 것으로 센다.
    expect(first.skipped + second.skipped).toBe(1);
    expect(first.stillPending + second.stillPending).toBe(0);
    expect(first.errors + second.errors).toBe(0);
    expect(fake.calls.cancel).toHaveLength(0);
    expect(await prisma.reservation.count()).toBe(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("paid");
  });

  it("confirming을 다시 확인하면 1분 넘게 멈춘 결제는 cron을 기다리지 않고 바로 정리한다", async () => {
    const prepared = await leaveConfirming("pk_recheck");
    approvedAtPg("pk_recheck", prepared.orderId, prepared.amount);

    // 바로 다시 누르면 원래 요청이 아직 처리 중일 수 있으므로 PG에 묻지 않는다.
    const early = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_recheck",
      amount: prepared.amount,
      provider: fake,
    });
    expect(early).toMatchObject({ ok: false, status: "processing" });
    expect(fake.calls.getPaymentByOrderId).toHaveLength(0);

    const later = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_recheck",
      amount: prepared.amount,
      provider: fake,
      now: twoMinutesLater(),
    });

    expect(later).toMatchObject({ ok: true, status: "confirmed" });
    expect(fake.calls.getPaymentByOrderId).toEqual([prepared.orderId]);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("확정 실패 뒤 환불도 실패한 결제는 PG가 승인 완료여도 예약을 만들지 않고 환불만 다시 한다", async () => {
    const prepared = await prepare();
    // 같은 슬롯 예약이 먼저 있어 확정 단계의 락 INSERT가 충돌하고, 환불도 실패한다.
    const direct = await createReservationInDb({ userId: userA, draft: draft(), gym: TEST_GYM });
    if (!direct.ok) throw new Error("직접 예약 실패");
    fake.nextCancel = UNKNOWN_FAILURE;
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });
    expect(result).toMatchObject({ ok: false, status: "refund-pending-after-failure" });
    expect(result.ok ? "" : result.message).toContain("자동으로 취소될 예정");
    // 충돌하던 예약이 사라져 이제는 확정이 가능하다. 그래도 "취소될 예정" 이라고 안내했으므로 확정하지 않는다.
    await prisma.reservation.delete({ where: { id: direct.reservation.id } });

    const summary = await reconcilePayments({ now: twoMinutesLater(), resolveProvider: () => fake });

    expect(summary).toMatchObject({ refunded: 1, confirmed: 0, errors: 0 });
    expect(fake.calls.cancel).toHaveLength(2);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("refunded");
    expect(payment.reservationId).toBeNull();
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("처리 시간 한도를 넘으면 남은 결제는 손대지 않고 다음 실행으로 넘긴다", async () => {
    const prepared = await leaveConfirming("pk_budget");
    approvedAtPg("pk_budget", prepared.orderId, prepared.amount);

    const summary = await reconcilePayments({
      now: twoMinutesLater(),
      resolveProvider: () => fake,
      timeBudgetMs: 0,
    });

    expect(summary).toMatchObject({ deferred: 1, confirmed: 0, errors: 0 });
    expect(fake.calls.getPaymentByOrderId).toHaveLength(0);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("confirming");
  });
});

// ── diff-review 2차 반영 (2026-11-22) ───────────────────────────────────────────

// 결제창을 열고 PAYMENT_HOLD_TTL_MS 넘게 지난 선점을 만든다(결제창을 닫고 떠난 사용자).
async function prepareExpired(userId: string, time = "10:00") {
  return prepare(userId, time, new Date(Date.now() - PAYMENT_HOLD_TTL_MS - 60_000));
}

async function createSlot(time: string, capacity: number) {
  await prisma.reservationSlot.create({
    data: {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date: futureDate(),
      time,
      capacity,
      reservedCount: 0,
    },
  });
}

describe("만료된 선점은 정원을 읽는 곳에서 먼저 풀린다", () => {
  it("만료된 선점이 마지막 정원을 잡은 슬롯도 조회하면 예약 가능으로 보인다", async () => {
    await createSlot("10:00", 1);
    const stale = await prepareExpired(userA);
    expect(await reservedCount()).toBe(1);

    const slots = await listReservationSlotAvailabilities({
      gym: TEST_GYM,
      sport: "배드민턴",
      date: futureDate(),
    });

    expect(slots.find((slot) => slot.time === "10:00")).toMatchObject({
      reservedCount: 0,
      remaining: 1,
      status: "available",
    });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } });
    expect(payment.status).toBe("expired");
  });

  it("더 오래된 만료 선점이 20건 넘게 있어도 준비 요청은 대상 슬롯의 만료 선점을 풀고 선점한다", async () => {
    await createSlot("10:00", 1);
    const stale = await prepareExpired(userA);
    // 다른 날짜에 더 오래된 만료 선점 20건. 전역 정리(오래된 순 20건)는 이것만 처리한다.
    // userA 의 준비 요청이 전역 정리로 지우지 않게, 그 뒤에 만든다.
    const older = new Date(Date.now() - PAYMENT_HOLD_TTL_MS - 10 * 60_000);
    await prisma.payment.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `ord_old_stale_${index}`,
        userId: `stale-user-${index}`,
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(3),
        time: "10:00",
        people: 1,
        amount: 1000,
        orderName: "old stale",
        status: "pending",
        provider: "toss",
        expiresAt: older,
      })),
    });

    const result = await preparePaymentInDb({
      userId: userB,
      draft: draft(),
      gym: TEST_GYM,
      provider: "toss",
    });

    expect(result.ok).toBe(true);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } })).status,
    ).toBe("expired");
    expect(await reservedCount()).toBe(1);
  });

  it("만료된 선점만 있는 슬롯은 관리자가 정원을 줄일 수 있다(단건)", async () => {
    await createSlot("10:00", 2);
    await prepareExpired(userA);
    await prepareExpired(userB);
    expect(await reservedCount()).toBe(2);

    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date: futureDate(),
      time: "10:00",
      capacity: 1,
    });

    expect(result.ok).toBe(true);
    expect(await reservedCount()).toBe(0);
  });

  it("만료된 선점만 있는 슬롯은 관리자가 정원을 줄일 수 있다(일괄)", async () => {
    await createSlot("10:00", 2);
    await prepareExpired(userA);
    await prepareExpired(userB);

    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      dates: [futureDate()],
      times: ["10:00"],
      capacity: 1,
    });

    expect(result.ok).toBe(true);
    expect(await reservedCount()).toBe(0);
  });

  it("만료 전 선점은 풀지 않는다", async () => {
    await createSlot("10:00", 1);
    const live = await prepare(userA);

    const slots = await listReservationSlotAvailabilities({
      gym: TEST_GYM,
      sport: "배드민턴",
      date: futureDate(),
    });

    expect(slots.find((slot) => slot.time === "10:00")).toMatchObject({ status: "full" });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: live.orderId } })).status,
    ).toBe("pending");
  });
});

describe("취소 마감 뒤의 환불 재시도", () => {
  // 취소 마감(이용 2시간 전)이 지난 시각.
  const afterDeadline = () => new Date(slotStart().getTime() - 60 * 60_000);

  it("마감 전에 시작한 취소의 환불이 실패해 남았으면, 마감 뒤에도 다시 취소해 환불을 끝낸다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    await cancelReservationInDb(userA, reservation.id, { resolvePaymentProvider: () => fake });

    const retried = await cancelReservationInDb(userA, reservation.id, {
      now: afterDeadline(),
      resolvePaymentProvider: () => fake,
    });

    expect(retried).toMatchObject({ ok: true, status: "cancelled" });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refunded");
    expect(await reservedCount()).toBe(0);
  });

  it("환불이 시작되지 않은 결제된 예약은 마감 뒤 취소를 지금처럼 거절한다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();

    const result = await cancelReservationInDb(userA, reservation.id, {
      now: afterDeadline(),
      resolvePaymentProvider: () => fake,
    });

    expect(result).toMatchObject({ ok: false, status: "not-cancellable" });
    expect(fake.calls.cancel).toHaveLength(0);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("paid");
  });
});

describe("수동 환불 대상", () => {
  it("닫힌 결제에 승인이 와서 환불했는데 실패하면 manual-refund-required 로 돌려준다", async () => {
    const prepared = await prepare();
    const confirmAtPg = fake.confirm;
    fake.confirm = async (input) => {
      const approved = await confirmAtPg(input);
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "failed", holdKey: null, failureReason: "test-closed" },
      });
      return approved;
    };
    fake.nextCancel = UNKNOWN_FAILURE;

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "manual-refund-required" });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).failureReason,
    ).toMatch(/^late-approval-refund-failed/);
  });
});

describe("관리자 취소의 환불 결과 구분", () => {
  it("환불만 끝나고 예약은 이용 완료라 취소하지 않았으면 refunded 를 표시한다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    await prisma.payment.update({
      where: { id: prepared.orderId },
      data: { status: "refund_pending" },
    });
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "used" } });

    const result = await cancelReservationAsAdminInDb(reservation.id, {
      resolvePaymentProvider: () => fake,
    });

    expect(result).toMatchObject({ ok: false, status: "not-cancellable", refunded: true });
  });

  it("그냥 취소할 수 없는 예약에는 refunded 를 붙이지 않는다", async () => {
    const { reservation } = await prepareAndConfirm();
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "used" } });

    const result = await cancelReservationAsAdminInDb(reservation.id, {
      resolvePaymentProvider: () => fake,
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("refunded");
  });
});

describe("정리 cron 의 처리 시각", () => {
  it("실행 중 시간이 흘러 이용 시각이 지난 뒤 처리한 결제는 예약을 만들지 않고 환불한다", async () => {
    const prepared = await leaveConfirming("pk_clock");
    approvedAtPg("pk_clock", prepared.orderId, prepared.amount);
    // 실행 시작은 이용 1분 전. 이 결제를 처리할 때는 5분이 지나 있다.
    let calls = 0;
    const clock = () => (calls++ === 0 ? 0 : 5 * 60_000);

    const summary = await reconcilePayments({
      now: new Date(slotStart().getTime() - 60_000),
      resolveProvider: () => fake,
      clock,
      timeBudgetMs: 60 * 60_000,
    });

    expect(summary).toMatchObject({ refunded: 1, confirmed: 0 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.failureReason).toBe("slot-started");
    expect(await prisma.reservation.count()).toBe(0);
  });
});

describe("PG 결제키 저장", () => {
  it("예약 확정 때 PG 응답의 결제키를 저장하고 환불에 그 키를 쓴다", async () => {
    const prepared = await prepare();
    const fromPg = {
      paymentKey: "pk_from_pg",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "done" as const,
    };
    fake.payments.set("pk_from_pg", fromPg);
    fake.nextConfirm = { ok: true, value: fromPg };

    const confirmed = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_from_browser",
      amount: prepared.amount,
      provider: fake,
    });
    if (!confirmed.ok) throw new Error(`confirm 실패: ${confirmed.status}`);

    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } }))
        .providerPaymentKey,
    ).toBe("pk_from_pg");

    const cancelled = await cancelReservationInDb(userA, confirmed.reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(cancelled).toMatchObject({ ok: true, status: "cancelled" });
    expect(fake.calls.cancel.map((call) => call.paymentKey)).toEqual(["pk_from_pg"]);
  });
});

describe("정리 cron 의 취소 알림", () => {
  it("환불 대기 예약을 취소하면 알림을 한 번 보낸다", async () => {
    const { reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    await cancelReservationInDb(userA, reservation.id, { resolvePaymentProvider: () => fake });
    const notified: string[] = [];

    const summary = await reconcilePayments({
      resolveProvider: () => fake,
      notifyCancelled: async (cancelled) => {
        notified.push(cancelled.id);
      },
    });

    expect(summary.refunded).toBe(1);
    expect(notified).toEqual([reservation.id]);
  });

  it("알림이 실패해도 정리 결과는 그대로다", async () => {
    const { reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    await cancelReservationInDb(userA, reservation.id, { resolvePaymentProvider: () => fake });

    const summary = await reconcilePayments({
      resolveProvider: () => fake,
      notifyCancelled: async () => {
        throw new Error("slack down");
      },
    });

    expect(summary).toMatchObject({ refunded: 1, errors: 0 });
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status,
    ).toBe("cancelled");
  });

  it("예약이 이용 완료라 취소하지 않았으면 알림을 보내지 않는다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    await prisma.payment.update({
      where: { id: prepared.orderId },
      data: { status: "refund_pending" },
    });
    await prisma.reservation.update({ where: { id: reservation.id }, data: { status: "used" } });
    const notified: string[] = [];

    await reconcilePayments({
      resolveProvider: () => fake,
      notifyCancelled: async (cancelled) => {
        notified.push(cancelled.id);
      },
    });

    expect(notified).toEqual([]);
  });
});

describe("테스트용 가짜 PG", () => {
  it("모르는 결제키의 취소는 거절한다", async () => {
    const result = await fake.cancel({
      paymentKey: "pk_unknown",
      cancelReason: "test",
      idempotencyKey: "refund-unknown",
    });

    expect(result).toMatchObject({ ok: false, kind: "rejected", code: "NOT_FOUND_PAYMENT" });
  });
});

// ── diff-review 3차 반영 (2026-11-22) ───────────────────────────────────────────

describe("3차 반영", () => {
  it("수동 환불 대상 결제는 같은 승인 요청을 다시 보내도 manual-refund-required 를 돌려준다", async () => {
    const prepared = await prepare();
    const confirmAtPg = fake.confirm;
    fake.confirm = async (input) => {
      const approved = await confirmAtPg(input);
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "failed", holdKey: null, failureReason: "test-closed" },
      });
      return approved;
    };
    fake.nextCancel = UNKNOWN_FAILURE;
    const input = {
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    };
    const first = await confirmPaymentInDb(input);
    expect(first).toMatchObject({ ok: false, status: "manual-refund-required" });

    const again = await confirmPaymentInDb(input);

    expect(again).toMatchObject({ ok: false, status: "manual-refund-required" });
    expect(again.ok ? "" : again.message).toContain("고객센터");
  });

  it("정리 cron 이 시간이 지난 뒤 선점한 결제의 선점 시각은 그 시점의 시각이다", async () => {
    const prepared = await leaveConfirming("pk_claim_time");
    // PG 에서 아직 진행 중이라 선점 뒤 결제를 바꾸지 않는다. 그래서 updatedAt 이 선점 때 넣은 값으로 남는다.
    fake.payments.set("pk_claim_time", {
      paymentKey: "pk_claim_time",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "in-progress",
    });
    const startedNow = twoMinutesLater();
    let calls = 0;
    const clock = () => (calls++ === 0 ? 0 : 3 * 60_000);

    const summary = await reconcilePayments({
      now: startedNow,
      resolveProvider: () => fake,
      clock,
      timeBudgetMs: 60 * 60_000,
    });

    expect(summary.stillPending).toBe(1);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("confirming");
    expect(payment.updatedAt.getTime()).toBe(startedNow.getTime() + 3 * 60_000);
  });

  it("확정 뒤 저장된 PG 결제키와 다른, 브라우저가 처음 보낸 키로 다시 요청해도 같은 예약을 돌려준다", async () => {
    const prepared = await prepare();
    const fromPg = {
      paymentKey: "pk_pg_value",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "done" as const,
    };
    fake.payments.set("pk_pg_value", fromPg);
    fake.nextConfirm = { ok: true, value: fromPg };
    const input = {
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_browser_value",
      amount: prepared.amount,
      provider: fake,
    };
    const first = await confirmPaymentInDb(input);
    if (!first.ok) throw new Error(`confirm 실패: ${first.status}`);

    const again = await confirmPaymentInDb(input);

    expect(again).toMatchObject({ ok: true, status: "already-confirmed" });
    if (again.ok) expect(again.reservation.id).toBe(first.reservation.id);
    expect(fake.calls.confirm).toHaveLength(1);
  });
});

// ── diff-review 4차 반영 (2026-11-22) ───────────────────────────────────────────

describe("4차 반영", () => {
  // PG 조회 직전에 결제 상태를 바꾼다. 다른 경로(사용자 재확인, 겹친 정리 실행, 사람의 처리)가
  // 그 사이에 결제를 끝낸 상황을 만든다.
  function changeStatusBeforeLookup(orderId: string, status: string) {
    const lookup = fake.getPaymentByOrderId;
    fake.getPaymentByOrderId = async (id) => {
      await prisma.payment.update({ where: { id: orderId }, data: { status, holdKey: null } });
      return lookup(id);
    };
  }

  it("확정하려는 결제가 이미 환불됐으면 PG 에 취소를 다시 보내지 않는다", async () => {
    const prepared = await prepare();
    const confirmAtPg = fake.confirm;
    fake.confirm = async (input) => {
      const approved = await confirmAtPg(input);
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "refunded", holdKey: null },
      });
      return approved;
    };

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({ ok: false, status: "processing" });
    expect(result.ok ? "" : result.message).toContain("잠시 뒤 결과를 다시 확인");
    expect(fake.calls.cancel).toHaveLength(0);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refunded");
  });

  it("수동 환불 사유가 남아 있어도 이미 환불된 결제에는 고객센터 안내를 하지 않고 환불됐다고 알린다", async () => {
    const prepared = await prepare();
    await prisma.payment.update({
      where: { id: prepared.orderId },
      data: {
        status: "refunded",
        holdKey: null,
        failureReason: "late-approval-refund-failed:NETWORK_ERROR",
      },
    });

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "not-pending",
      message: "이미 환불된 결제입니다. 예약은 진행되지 않았습니다.",
    });
    expect(fake.calls.confirm).toHaveLength(0);
  });

  it("결제한 예약을 취소해 환불된 결제로 다시 승인 요청을 보내면 내 예약에서 확인하라고 안내한다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    const cancelled = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(cancelled).toMatchObject({ ok: true, status: "cancelled" });

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "not-pending",
      message: "이미 환불된 결제입니다. 내 예약에서 상태를 확인해 주세요.",
    });
  });

  it("환불만 남은 결제를 다시 확인하는 사이 다른 경로가 환불을 끝냈으면 취소를 다시 보내지 않고 잠시 뒤 확인하라고 안내한다", async () => {
    const prepared = await leaveConfirming("pk_refund_only");
    approvedAtPg("pk_refund_only", prepared.orderId, prepared.amount);
    await prisma.payment.update({
      where: { id: prepared.orderId },
      data: { failureReason: "finalize-failed:NETWORK_ERROR" },
    });
    changeStatusBeforeLookup(prepared.orderId, "refunded");

    // 1분 넘게 멈춘 confirming 이라 사용자의 재확인이 PG 조회로 정리한다.
    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: "pk_refund_only",
      amount: prepared.amount,
      provider: fake,
      now: twoMinutesLater(),
    });

    expect(result).toMatchObject({ ok: false, status: "processing" });
    expect(result.ok ? "" : result.message).toContain("잠시 뒤 결과를 다시 확인");
    expect(fake.calls.cancel).toHaveLength(0);
  });

  it("정리 cron 은 처리하는 사이 다른 경로가 끝낸 결제를 오류가 아니라 건너뛴 것으로 센다", async () => {
    const prepared = await leaveConfirming("pk_done_elsewhere");
    approvedAtPg("pk_done_elsewhere", prepared.orderId, prepared.amount);
    changeStatusBeforeLookup(prepared.orderId, "paid");

    const summary = await reconcilePayments({
      now: twoMinutesLater(),
      resolveProvider: () => fake,
    });

    expect(summary).toMatchObject({ skipped: 1, errors: 0, confirmed: 0 });
    expect(fake.calls.cancel).toHaveLength(0);
  });

  it("정리 cron 은 PG 응답의 orderId 가 달라 confirming 으로 남은 결제는 오류로 센다", async () => {
    const prepared = await leaveConfirming("pk_other_order");
    fake.payments.set("pk_other_order", {
      paymentKey: "pk_other_order",
      orderId: prepared.orderId,
      totalAmount: prepared.amount,
      state: "done",
    });
    const lookup = fake.getPaymentByOrderId;
    fake.getPaymentByOrderId = async (id) => {
      const found = await lookup(id);
      return found.ok ? { ok: true, value: { ...found.value, orderId: "ord_someone_else" } } : found;
    };

    const summary = await reconcilePayments({
      now: twoMinutesLater(),
      resolveProvider: () => fake,
    });

    expect(summary).toMatchObject({ skipped: 0, errors: 1 });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("confirming");
  });
});

// ── diff-review 5차 반영 (2026-11-22) ───────────────────────────────────────────

describe("5차 반영", () => {
  it("정리 cron 은 처리하는 사이 닫힌 결제의 환불까지 실패해 사람이 환불해야 하면 오류로 센다", async () => {
    const prepared = await leaveConfirming("pk_manual_refund");
    approvedAtPg("pk_manual_refund", prepared.orderId, prepared.amount);
    // PG 조회 직전에 다른 경로가 결제를 닫았다(failed). 확정 경로는 늦게 온 승인으로 보고 환불하는데 그 환불도 실패한다.
    const lookup = fake.getPaymentByOrderId;
    fake.getPaymentByOrderId = async (id) => {
      await prisma.payment.update({
        where: { id: prepared.orderId },
        data: { status: "failed", holdKey: null },
      });
      return lookup(id);
    };
    fake.nextCancel = UNKNOWN_FAILURE;

    const summary = await reconcilePayments({
      now: twoMinutesLater(),
      resolveProvider: () => fake,
    });

    expect(summary).toMatchObject({ errors: 1, skipped: 0 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("failed");
    expect(payment.failureReason).toMatch(/^late-approval-refund-failed/);
  });

  it("환불이 진행 중인 결제로 다시 승인 요청을 보내면 다시 예약하라고 하지 않고 내 예약에서 확인하라고 안내한다", async () => {
    const { prepared, reservation } = await prepareAndConfirm();
    fake.nextCancel = UNKNOWN_FAILURE;
    const cancelled = await cancelReservationInDb(userA, reservation.id, {
      resolvePaymentProvider: () => fake,
    });
    expect(cancelled.ok).toBe(false);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("refund_pending");

    const result = await confirmPaymentInDb({
      userId: userA,
      orderId: prepared.orderId,
      paymentKey: `pk_${prepared.orderId}`,
      amount: prepared.amount,
      provider: fake,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "not-pending",
      message: "환불이 진행 중인 결제입니다. 내 예약에서 상태를 확인해 주세요.",
    });
    expect(fake.calls.confirm).toHaveLength(1);
  });
});
