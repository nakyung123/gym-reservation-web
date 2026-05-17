import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/naver/token/route";
import { createTicket } from "@/lib/server/oauth/handover-ticket";
import { cookies } from "next/headers";

// /api/auth/naver/token 보안 회귀 방지. 카카오 /token과 동일 가드 적용 확인.

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
  return new Request("http://localhost/api/auth/naver/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/auth/naver/token", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("handover nonce 쿠키가 없으면 401을 반환한다", async () => {
    const ticket = await createTicket({
      anonUid: "anon",
      targetUid: "naver:1",
      provider: "naver",
      handoverNonce: "secret-nonce",
      profilePayload: null,
    });
    mockCookies(undefined);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("handover nonce가 ticket과 불일치하면 401을 반환한다", async () => {
    const ticket = await createTicket({
      anonUid: "anon",
      targetUid: "naver:1",
      provider: "naver",
      handoverNonce: "secret-nonce",
      profilePayload: null,
    });
    mockCookies("other-nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("provider가 naver가 아니면 400을 반환한다", async () => {
    const ticket = await createTicket({
      anonUid: "anon",
      targetUid: "kakao:1",
      provider: "kakao",
      handoverNonce: "nonce",
      profilePayload: null,
    });
    mockCookies("nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("handover nonce가 일치하면 customToken을 발급한다", async () => {
    const ticket = await createTicket({
      anonUid: "anon",
      targetUid: "naver:1",
      provider: "naver",
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
});
