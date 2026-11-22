import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/payment-reconcile/route";
import { preparePaymentInDb } from "@/lib/server/db-payment-repository";
import { prisma } from "@/lib/server/prisma-client";
import { PAYMENT_HOLD_TTL_MS } from "@/lib/payment";
import { TEST_GYM, futureDate } from "@tests/setup-db";
import {
  createFakePaymentProvider,
  UNKNOWN_FAILURE,
  type FakePaymentProvider,
} from "@tests/fake-payment-provider";

const { fakeHolder } = vi.hoisted(() => ({
  fakeHolder: { current: null as FakePaymentProvider | null },
}));

// 정리 cron 의 취소 알림이 실제 Slack 으로 나가지 않게 한다(로컬 설정에 따라 결과가 달라지지 않게).
vi.mock("@/lib/server/reservation-notify", () => ({ notifyReservationEvent: vi.fn() }));

// PG 조회는 실제 토스 대신 가짜 PG로 보낸다. 환경 변수(TOSS_SECRET_KEY)와 상관없이 결과가 같게 한다.
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

const SECRET = "test-cron-secret";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/payment-reconcile", {
    headers: authorization ? { authorization } : {},
  });
}

async function preparePast(userId: string, time: string) {
  const result = await preparePaymentInDb({
    userId,
    draft: {
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      date: futureDate(),
      time,
      paymentMethod: "card",
      phone: null,
    },
    gym: TEST_GYM,
    provider: "toss",
    now: new Date(Date.now() - PAYMENT_HOLD_TTL_MS - 60_000),
  });
  if (!result.ok) throw new Error(`prepare 실패: ${result.status}`);
  return result.payment;
}

describe("GET /api/cron/payment-reconcile", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    fakeHolder.current = createFakePaymentProvider();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    vi.restoreAllMocks();
    fakeHolder.current = null;
  });

  it("CRON_SECRET이 없으면 500이고 정리를 하지 않는다", async () => {
    delete process.env.CRON_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stale = await preparePast("cron-user-a", "10:00");

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } })).status,
    ).toBe("pending");
  });

  it("Authorization 헤더가 틀리면 401이고 정리를 하지 않는다", async () => {
    const stale = await preparePast("cron-user-a", "10:00");

    const response = await GET(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } })).status,
    ).toBe("pending");
  });

  it("Authorization 헤더가 없으면 401이다", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it("인증되면 만료된 선점을 정리하고 200과 요약을 돌려준다", async () => {
    const stale = await preparePast("cron-user-a", "10:00");

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = (await response.json()) as {
      ok?: unknown;
      summary?: { expired: number; errors: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toMatchObject({ expired: 1, errors: 0 });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: stale.orderId } })).status,
    ).toBe("expired");
  });

  it("처리하지 못한 결제가 있으면 성공으로 덮지 않고 500과 요약을 돌려준다", async () => {
    const stuck = await preparePast("cron-user-b", "11:00");
    // PG 조회가 응답을 받지 못하면(결과 모름) errors 로 세고, 결제 상태는 confirming 으로 남는다.
    fakeHolder.current!.getPaymentByOrderId = async () => UNKNOWN_FAILURE;
    await prisma.payment.update({
      where: { id: stuck.orderId },
      data: { status: "confirming", updatedAt: new Date(Date.now() - 5 * 60_000) },
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = (await response.json()) as {
      ok?: unknown;
      summary?: { errors: number };
    };

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.summary?.errors).toBe(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: stuck.orderId } })).status,
    ).toBe("confirming");
  });
});
