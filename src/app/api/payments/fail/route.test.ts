import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payments/fail/route";
import { preparePaymentInDb } from "@/lib/server/db-payment-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const USER = "fail-route-user";

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

function failRequest(body: unknown, withAuth = true) {
  return new NextRequest("http://localhost:3000/api/payments/fail", {
    method: "POST",
    headers: {
      ...(withAuth ? { Authorization: "Bearer test-id-token" } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function reservedCount() {
  const slot = await prisma.reservationSlot.findFirst({
    where: { gymId: TEST_GYM.id, sport: "배드민턴", date: futureDate(), time: "10:00" },
  });
  return slot?.reservedCount ?? 0;
}

describe("POST /api/payments/fail", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: USER });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("결제를 failed로 닫고 정원을 돌려준다. 다시 보내면 unchanged이고 정원은 한 번만 돌아온다", async () => {
    const prepared = await prepare();
    expect(await reservedCount()).toBe(1);

    const first = await POST(failRequest({ orderId: prepared.orderId, code: "PAY_PROCESS_CANCELED" }));
    expect(first.status).toBe(200);
    expect(((await first.json()) as { status?: unknown }).status).toBe("failed");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.status).toBe("failed");
    expect(payment.failureReason).toBe("window:PAY_PROCESS_CANCELED");
    expect(await reservedCount()).toBe(0);

    const second = await POST(failRequest({ orderId: prepared.orderId, code: "PAY_PROCESS_CANCELED" }));
    expect(second.status).toBe(200);
    expect(((await second.json()) as { status?: unknown }).status).toBe("unchanged");
    expect(await reservedCount()).toBe(0);
  });

  it("형식에 맞지 않는 code는 UNKNOWN으로 기록한다", async () => {
    const prepared = await prepare();

    await POST(failRequest({ orderId: prepared.orderId, code: "<script>" }));

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } });
    expect(payment.failureReason).toBe("window:UNKNOWN");
  });

  it("Authorization 헤더가 없으면 401을 반환하고 결제를 닫지 않는다", async () => {
    const prepared = await prepare();

    const response = await POST(failRequest({ orderId: prepared.orderId }, false));

    expect(response.status).toBe(401);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("pending");
  });

  it("orderId 형식이 틀리면 400을 반환한다", async () => {
    const response = await POST(failRequest({ orderId: "x" }));

    expect(response.status).toBe(400);
  });

  it("다른 사용자의 결제는 403을 반환하고 닫지 않는다", async () => {
    const prepared = await prepare("fail-route-other");

    const response = await POST(failRequest({ orderId: prepared.orderId }));

    expect(response.status).toBe(403);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: prepared.orderId } })).status,
    ).toBe("pending");
    expect(await reservedCount()).toBe(1);
  });

  it("없는 결제는 404를 반환한다", async () => {
    const response = await POST(failRequest({ orderId: "missing-order-1" }));

    expect(response.status).toBe(404);
  });
});
