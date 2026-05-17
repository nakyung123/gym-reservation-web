import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/naver/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

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
  return new Request("http://localhost/api/auth/naver/finalize", {
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
    targetUid: overrides?.targetUid ?? "naver:42",
    provider: "naver",
    handoverNonce: overrides?.nonce ?? "valid-nonce",
    profilePayload: { nickname: "테스트" },
  });
  await markTokenIssued(ticket.ticketId);
  return ticket;
}

describe("/api/auth/naver/finalize", () => {
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

  it("인증된 uid가 ticket.targetUid와 다르면 401", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "naver:legit" });
    mockVerify("naver:attacker");
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("정상이면 finalized로 전이하고 profileSynced를 응답한다", async () => {
    const ticket = await makeIssuedTicket();
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(200);
    const stored = await prisma.authHandoverTicket.findUnique({
      where: { ticketId: ticket.ticketId },
    });
    expect(stored?.status).toBe("finalized");
  });
});
