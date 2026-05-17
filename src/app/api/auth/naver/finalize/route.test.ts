import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/naver/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

// /api/auth/naver/finalize 회귀 방지. 카카오 finalize와 같은 보안/판정 정책 검증.

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
  anonUid?: string;
  targetUid?: string;
  nonce?: string;
}) {
  const ticket = await createTicket({
    anonUid: overrides?.anonUid ?? "anon-uid",
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

  it("handover nonce 쿠키가 없으면 401을 반환한다", async () => {
    const ticket = await makeIssuedTicket();
    mockVerify(ticket.targetUid);
    mockCookies(undefined);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("인증된 uid가 ticket.targetUid와 다르면 401을 반환한다", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "naver:legit" });
    mockVerify("naver:attacker");
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("신규 가입(target 데이터 0)이면 migration을 실행하고 transferred:true를 반환한다", async () => {
    const ticket = await makeIssuedTicket({
      anonUid: "anon-new-naver",
      targetUid: "naver:new",
    });
    await prisma.favorite.create({
      data: { userId: "anon-new-naver", gymId: "gym-test-1" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transferred: boolean };
    expect(body.transferred).toBe(true);

    const migrated = await prisma.favorite.findUnique({
      where: { userId_gymId: { userId: ticket.targetUid, gymId: "gym-test-1" } },
    });
    expect(migrated).not.toBeNull();
  });

  it("기존 가입 + confirmed:false면 409 conflict를 반환한다", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "naver:existing" });
    await prisma.favorite.create({
      data: { userId: ticket.targetUid, gymId: "gym-test-1" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId, confirmed: false }) as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { conflict: string };
    expect(body.conflict).toBe("existing_account");
  });
});
