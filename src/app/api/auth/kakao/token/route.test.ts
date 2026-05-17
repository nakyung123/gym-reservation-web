import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/kakao/token/route";
import { createTicket } from "@/lib/server/oauth/handover-ticket";
import { cookies } from "next/headers";

// /token 보안 회귀 방지 테스트. handover nonce cookie를 검증하지 않으면
// ticketId만 가진 공격자에게 customToken이 발급될 수 있다.

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({
    createCustomToken: vi.fn().mockResolvedValue("fake-custom-token"),
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

describe("/api/auth/kakao/token", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
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
