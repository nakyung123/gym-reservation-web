import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/kakao/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

// /api/auth/kakao/finalize 회귀 방지.
// 핵심: nonce cookie 누락/불일치 → 401, targetUid mismatch → 401, 정상 finalize는
// status=finalized + profileSynced 응답.

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({
  verifyIdTokenFromRequest: vi.fn(),
}));
vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ updateUser: vi.fn().mockResolvedValue({}) }),
}));

const cookiesMock = vi.mocked(cookies);
const verifyMock = vi.mocked(verifyIdTokenFromRequest);

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

function mockVerify(uid: string): void {
  verifyMock.mockResolvedValue({ ok: true, uid, signInProvider: "custom" });
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/kakao/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fake-id-token",
    },
    body: JSON.stringify(body),
  });
}

async function makeIssuedTicket(overrides?: {
  targetUid?: string;
  nonce?: string;
}) {
  const ticket = await createTicket({
    targetUid: overrides?.targetUid ?? "kakao:42",
    provider: "kakao",
    handoverNonce: overrides?.nonce ?? "valid-nonce",
    profilePayload: { nickname: "테스트" },
  });
  await markTokenIssued(ticket.ticketId);
  return ticket;
}

describe("/api/auth/kakao/finalize", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    verifyMock.mockReset();
  });

  it("nonce 쿠키가 없으면 401", async () => {
    const ticket = await makeIssuedTicket();
    mockVerify(ticket.targetUid);
    mockCookies(undefined);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("nonce 불일치면 401", async () => {
    const ticket = await makeIssuedTicket({ nonce: "real" });
    mockVerify(ticket.targetUid);
    mockCookies("forged");
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("인증된 uid가 ticket.targetUid와 다르면 401", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "kakao:legit" });
    mockVerify("kakao:attacker");
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("token 발급 전 pending ticket은 finalize를 거부한다", async () => {
    const ticket = await createTicket({
      targetUid: "kakao:42",
      provider: "kakao",
      handoverNonce: "valid-nonce",
      profilePayload: null,
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(409);
  });

  it("finalize 재시도 횟수를 초과하면 429를 반환한다", async () => {
    const ticket = await makeIssuedTicket();
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { finalizeAttemptCount: 5 },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(429);
    const body = (await res.json()) as { retryable?: boolean };
    expect(body.retryable).toBe(false);
  });

  it("정상이면 ticket을 finalized로 전이하고 profileSynced를 응답한다", async () => {
    const ticket = await makeIssuedTicket();
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; profileSynced: boolean };
    expect(body.ok).toBe(true);
    expect(body.profileSynced).toBe(true);

    const stored = await prisma.authHandoverTicket.findUnique({
      where: { ticketId: ticket.ticketId },
    });
    expect(stored?.status).toBe("finalized");
  });

  it("이미 finalized인 ticket 재호출은 idempotent하게 200을 반환한다", async () => {
    const ticket = await makeIssuedTicket();
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { status: "finalized" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(200);
  });
});
