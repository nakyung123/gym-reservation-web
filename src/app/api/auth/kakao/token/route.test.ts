import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/kakao/token/route";
import {
  createTicket,
  markSignedIn,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";
import { cookies } from "next/headers";

// /token 보안 회귀 방지 테스트. handover nonce cookie를 검증하지 않으면
// ticketId만 가진 공격자에게 customToken이 발급될 수 있다.

const { createCustomTokenMock } = vi.hoisted(() => ({
  createCustomTokenMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({
    createCustomToken: createCustomTokenMock,
  }),
}));

const cookiesMock = vi.mocked(cookies);

function mockCookies(nonce: string | undefined): void {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === "oauth_handover_nonce" && nonce !== undefined
        ? { name, value: nonce }
        : undefined,
    set: vi.fn(),
    delete: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/kakao/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string): Request {
  return new Request("http://localhost/api/auth/kakao/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/auth/kakao/token", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    createCustomTokenMock.mockReset();
    createCustomTokenMock.mockResolvedValue("fake-custom-token");
  });

  it("JSON 본문 파싱 실패는 400을 반환하고 customToken을 만들지 않는다", async () => {
    const res = await POST(buildRawRequest("{") as never);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: unknown };
    expect(body.message).toBe("요청 본문이 올바르지 않습니다.");
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it("handover nonce 쿠키가 없으면 401을 반환한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:1",
      provider: "kakao",
      handoverNonce: "secret-nonce",
      profilePayload: null,
    });
    mockCookies(undefined);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("nonce");
  });

  it("handover nonce가 ticket과 불일치하면 401을 반환한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:1",
      provider: "kakao",
      handoverNonce: "secret-nonce",
      profilePayload: null,
    });
    mockCookies("other-nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(401);
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it("만료된 ticket이면 401을 반환하고 customToken을 만들지 않는다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:expired",
      provider: "kakao",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    mockCookies("nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { message?: unknown };
    expect(body.message).toBe("유효하지 않거나 만료된 ticket입니다.");
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it("handover nonce가 일치하면 customToken을 발급한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:1",
      provider: "kakao",
      handoverNonce: "matching-nonce",
      profilePayload: null,
    });
    mockCookies("matching-nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { customToken: string };
    expect(body.customToken).toBe("fake-custom-token");
  });

  it("provider가 kakao가 아니면 400을 반환한다", async () => {
    const ticket = await createTicket({
      targetUid: "naver:1",
      provider: "naver",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    mockCookies("nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(400);
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it("이미 signed_in 상태인 ticket은 token 재발급을 거부한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:1",
      provider: "kakao",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    await markTokenIssued(ticket.ticketId);
    await markSignedIn(ticket.ticketId);
    mockCookies("nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(409);
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it("Firebase customToken 발급 실패는 안전한 500 message를 반환하고 ticket 상태를 바꾸지 않는다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:token-fail",
      provider: "kakao",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    mockCookies("nonce");
    createCustomTokenMock.mockRejectedValueOnce(new Error("firebase down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await POST(
        buildRequest({ ticketId: ticket.ticketId }) as never,
      );
      const body = (await res.json()) as { message?: unknown };

      expect(res.status).toBe(500);
      expect(body.message).toBe("Custom Token 발급에 실패했습니다.");
      await expect(
        prisma.authHandoverTicket.findUnique({
          where: { ticketId: ticket.ticketId },
        }),
      ).resolves.toMatchObject({ status: "pending" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("ticket 상태 저장 실패는 customToken을 응답하지 않고 안전한 500 message를 반환한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:ticket-store-fail",
      provider: "kakao",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    mockCookies("nonce");
    const transactionSpy = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(new Error("database offline"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await POST(
        buildRequest({ ticketId: ticket.ticketId }) as never,
      );
      const body = (await res.json()) as {
        customToken?: unknown;
        message?: unknown;
      };

      expect(res.status).toBe(500);
      expect(body.customToken).toBeUndefined();
      expect(body.message).toBe("Custom Token 발급에 실패했습니다.");
      expect(String(body.message)).not.toContain("database offline");
      expect(createCustomTokenMock).toHaveBeenCalledOnce();
      await expect(
        prisma.authHandoverTicket.findUnique({
          where: { ticketId: ticket.ticketId },
        }),
      ).resolves.toMatchObject({ status: "pending" });
    } finally {
      transactionSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("존재하지 않는 ticketId면 401을 반환한다", async () => {
    mockCookies("any-nonce");

    const res = await POST(
      buildRequest({ ticketId: "non-existent-ticket" }) as never,
    );

    expect(res.status).toBe(401);
  });

  it("ticketId가 비어있으면 400을 반환한다", async () => {
    mockCookies("any-nonce");

    const res = await POST(buildRequest({}) as never);

    expect(res.status).toBe(400);
  });
});
