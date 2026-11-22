import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payments/prepare/route";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

const USER = "prepare-route-user";

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/payments/prepare", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-id-token",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    gymId: TEST_GYM.id,
    sport: "배드민턴",
    date: futureDate(),
    time: "10:00",
    paymentMethod: "card",
    ...overrides,
  };
}

describe("POST /api/payments/prepare", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: USER });
    vi.stubEnv("PAYMENT_PROVIDER", "toss");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("올바른 요청이면 201과 서버가 계산한 금액을 돌려주고 pending 결제를 만든다", async () => {
    const response = await POST(postRequest(validBody()));
    const body = (await response.json()) as {
      payment?: { orderId: string; amount: number };
    };

    expect(response.status).toBe(201);
    expect(body.payment?.amount).toBe(12000);
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: body.payment!.orderId },
    });
    expect(payment).toMatchObject({ userId: USER, status: "pending", amount: 12000 });
  });

  it("Authorization 헤더가 없으면 401을 반환하고 결제를 만들지 않는다", async () => {
    const request = new NextRequest("http://localhost:3000/api/payments/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(await prisma.payment.count()).toBe(0);
  });

  it("결제가 꺼져 있으면(PAYMENT_PROVIDER=none) 404를 반환한다", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "none");

    const response = await POST(postRequest(validBody()));

    expect(response.status).toBe(404);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("PAYMENT_PROVIDER 값이 잘못되면 500을 반환한다(결제를 조용히 끄지 않는다)", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "tosss");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("본문 형식이 올바르지 않으면 400을 반환한다", async () => {
    const response = await POST(postRequest(validBody({ sport: "축구공" })));

    expect(response.status).toBe(400);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("JSON 이 아니면 400을 반환한다", async () => {
    const response = await POST(postRequest("{not json"));

    expect(response.status).toBe(400);
  });

  it("가상계좌는 422 rejected로 거절한다", async () => {
    const response = await POST(postRequest(validBody({ paymentMethod: "virtual-account" })));
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected");
    expect(await prisma.payment.count()).toBe(0);
  });

  it("같은 슬롯에 이미 예약이 있으면 409 duplicate를 반환한다", async () => {
    const created = await createReservationInDb({
      userId: USER,
      draft: { gymId: TEST_GYM.id, sport: "배드민턴", date: futureDate(), time: "10:00" },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const response = await POST(postRequest(validBody()));
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("duplicate");
    expect(await prisma.payment.count()).toBe(0);
  });

  it("정원이 찬 슬롯이면 409 full을 반환한다", async () => {
    await prisma.reservationSlot.create({
      data: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: futureDate(),
        time: "10:00",
        capacity: 1,
        reservedCount: 1,
      },
    });

    const response = await POST(postRequest(validBody()));
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("full");
  });

  it("승인 처리 중인 결제가 있으면 409 in-progress를 반환한다", async () => {
    const first = await POST(postRequest(validBody()));
    const { payment } = (await first.json()) as { payment: { orderId: string } };
    await prisma.payment.update({
      where: { id: payment.orderId },
      data: { status: "confirming" },
    });

    const response = await POST(postRequest(validBody()));
    const body = (await response.json()) as { status?: unknown };

    expect(response.status).toBe(409);
    expect(body.status).toBe("in-progress");
    expect(await prisma.payment.count()).toBe(1);
  });
});
