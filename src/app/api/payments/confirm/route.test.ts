import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payments/confirm/route";
import { preparePaymentInDb } from "@/lib/server/db-payment-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";
import {
  createFakePaymentProvider,
  REJECTED_FAILURE,
  UNKNOWN_FAILURE,
  type FakePaymentProvider,
} from "@tests/fake-payment-provider";

const { verifyIdToken, notifyReservationEvent, fakeHolder } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  notifyReservationEvent: vi.fn(),
  fakeHolder: { current: null as FakePaymentProvider | null },
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

vi.mock("@/lib/server/reservation-notify", () => ({ notifyReservationEvent }));

// 실제 토스 대신 가짜 PG를 쓴다. 결제 모드 판단(getPaymentMode)은 실제 코드 그대로 둔다.
vi.mock("@/lib/server/payment/payment-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/payment/payment-config")>();
  return {
    ...actual,
    getPaymentProviderByName: () => {
      if (!fakeHolder.current) throw new Error("가짜 PG가 준비되지 않았다");
      return fakeHolder.current;
    },
  };
});

// after()를 즉시 실행으로 대체 → 응답 후 콜백(알림)을 테스트에서 동기로 관찰한다.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      void fn();
    },
  };
});

const USER = "confirm-route-user";

async function prepare(userId = USER) {
  const result = await preparePaymentInDb({
    userId,
    draft: {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date: futureDate(),
      time: "10:00",
      paymentMethod: "card",
      phone: null,
    },
    gym: TEST_GYM,
    provider: "toss",
  });
  if (!result.ok) throw new Error(`prepare 실패: ${result.status}`);
  return result.payment;
}

function confirmRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-id-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function bodyFor(prepared: { orderId: string; amount: number }, overrides = {}) {
  return {
    paymentKey: `pk_${prepared.orderId}`,
    orderId: prepared.orderId,
    amount: prepared.amount,
    ...overrides,
  };
}

describe("POST /api/payments/confirm", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: USER });
    notifyReservationEvent.mockReset();
    fakeHolder.current = createFakePaymentProvider();
    vi.stubEnv("PAYMENT_PROVIDER", "toss");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fakeHolder.current = null;
  });

  it("승인되면 201과 예약을 돌려주고 알림을 한 번 보낸다. 같은 요청을 다시 보내면 200이고 예약은 1건이다", async () => {
    const prepared = await prepare();

    const first = await POST(confirmRequest(bodyFor(prepared)));
    const firstBody = (await first.json()) as {
      status?: unknown;
      reservation?: { id: string; status: string };
    };
    expect(first.status).toBe(201);
    expect(firstBody.status).toBe("confirmed");
    expect(firstBody.reservation?.status).toBe("reserved");
    expect(notifyReservationEvent).toHaveBeenCalledTimes(1);

    const second = await POST(confirmRequest(bodyFor(prepared)));
    const secondBody = (await second.json()) as { status?: unknown };
    expect(second.status).toBe(200);
    expect(secondBody.status).toBe("already-confirmed");
    expect(notifyReservationEvent).toHaveBeenCalledTimes(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(fakeHolder.current?.calls.confirm).toHaveLength(1);
  });

  it("Authorization 헤더가 없으면 401을 반환하고 PG에 승인을 보내지 않는다", async () => {
    const prepared = await prepare();
    const request = new NextRequest("http://localhost:3000/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFor(prepared)),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(fakeHolder.current?.calls.confirm).toHaveLength(0);
  });

  it("orderId 형식이 틀리면 400을 반환한다", async () => {
    const prepared = await prepare();

    const response = await POST(confirmRequest(bodyFor(prepared, { orderId: "x" })));

    expect(response.status).toBe(400);
    expect(fakeHolder.current?.calls.confirm).toHaveLength(0);
  });

  it("amount 가 정수가 아니면 400을 반환한다", async () => {
    const prepared = await prepare();

    const response = await POST(confirmRequest(bodyFor(prepared, { amount: "12000" })));

    expect(response.status).toBe(400);
  });

  it("결제가 꺼져 있으면 404를 반환한다", async () => {
    const prepared = await prepare();
    vi.stubEnv("PAYMENT_PROVIDER", "none");

    const response = await POST(confirmRequest(bodyFor(prepared)));

    expect(response.status).toBe(404);
    expect(fakeHolder.current?.calls.confirm).toHaveLength(0);
  });

  it("다른 사용자의 결제는 403을 반환하고 승인하지 않는다", async () => {
    const prepared = await prepare("confirm-route-other");

    const response = await POST(confirmRequest(bodyFor(prepared)));

    expect(response.status).toBe(403);
    expect(fakeHolder.current?.calls.confirm).toHaveLength(0);
  });

  it("없는 결제는 404를 반환한다", async () => {
    const response = await POST(
      confirmRequest({ paymentKey: "pk_missing", orderId: "missing-order-1", amount: 12000 }),
    );

    expect(response.status).toBe(404);
  });

  it("금액이 다르면 400 amount-mismatch를 반환하고 PG에 보내지 않는다", async () => {
    const prepared = await prepare();

    const response = await POST(
      confirmRequest(bodyFor(prepared, { amount: prepared.amount + 1 })),
    );
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(400);
    expect(body.status).toBe("amount-mismatch");
    expect(fakeHolder.current?.calls.confirm).toHaveLength(0);
  });

  it("PG가 거절하면 422 rejected를 반환하고 예약을 만들지 않는다", async () => {
    const prepared = await prepare();
    fakeHolder.current!.nextConfirm = REJECTED_FAILURE;

    const response = await POST(confirmRequest(bodyFor(prepared)));
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(await prisma.reservation.count()).toBe(0);
    expect(notifyReservationEvent).not.toHaveBeenCalled();
  });

  it("PG 결과를 모르면 202 processing을 반환한다(성공으로 보이지 않게)", async () => {
    const prepared = await prepare();
    fakeHolder.current!.nextConfirm = UNKNOWN_FAILURE;

    const response = await POST(confirmRequest(bodyFor(prepared)));
    const body = (await response.json()) as { status?: unknown; reservation?: unknown };

    expect(response.status).toBe(202);
    expect(body.status).toBe("processing");
    expect(body.reservation).toBeUndefined();
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("닫힌 결제에 승인이 와서 환불했는데 실패하면 409 manual-refund-required(다시 보내도 같으므로 재시도 대상 아님)", async () => {
    const prepared = await prepare();
    const fake = fakeHolder.current!;
    // PG 승인 응답이 오기 전에 결제가 다른 경로로 닫힌 상황을 만든다.
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

    const response = await POST(confirmRequest(bodyFor(prepared)));
    const body = (await response.json()) as { status?: unknown; message?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("manual-refund-required");
    expect(body.message).toContain("고객센터");
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).failureReason,
    ).toMatch(/^late-approval-refund-failed/);
  });
});
