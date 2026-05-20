import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/kakao/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
  type HandoverProfilePayload,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

// /api/auth/kakao/finalize 회귀 방지.
// 핵심: nonce cookie 누락/불일치 → 401, targetUid mismatch → 401, 정상 finalize는
// status=finalized + profileSynced 응답.

const { updateUserMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({
  verifyIdTokenFromRequest: vi.fn(),
}));
vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ updateUser: updateUserMock }),
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

function mockVerifyFailure(): void {
  verifyMock.mockResolvedValue({
    ok: false,
    status: 401,
    message: "인증이 필요합니다.",
  });
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

function buildRawRequest(body: string): Request {
  return new Request("http://localhost/api/auth/kakao/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fake-id-token",
    },
    body,
  });
}

async function makeIssuedTicket(overrides?: {
  targetUid?: string;
  nonce?: string;
  provider?: "kakao" | "naver";
  profilePayload?: HandoverProfilePayload | null;
}) {
  const ticket = await createTicket({
    targetUid: overrides?.targetUid ?? "kakao:42",
    provider: overrides?.provider ?? "kakao",
    handoverNonce: overrides?.nonce ?? "valid-nonce",
    profilePayload: overrides?.profilePayload ?? { nickname: "테스트" },
  });
  await markTokenIssued(ticket.ticketId);
  return ticket;
}

describe("/api/auth/kakao/finalize", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    verifyMock.mockReset();
    updateUserMock.mockReset();
    updateUserMock.mockResolvedValue({});
  });

  it("인증 실패는 401을 반환하고 cookie/ticket 조회로 진행하지 않는다", async () => {
    mockVerifyFailure();

    const res = await POST(buildRequest({ ticketId: "ticket" }) as never);
    const body = (await res.json()) as { message?: unknown };

    expect(res.status).toBe(401);
    expect(body.message).toBe("인증이 필요합니다.");
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("JSON 본문 파싱 실패는 400을 반환하고 cookie/ticket 조회로 진행하지 않는다", async () => {
    mockVerify("kakao:42");

    const res = await POST(buildRawRequest("{") as never);
    const body = (await res.json()) as { message?: unknown };

    expect(res.status).toBe(400);
    expect(body.message).toBe("요청 본문이 올바르지 않습니다.");
    expect(cookiesMock).not.toHaveBeenCalled();
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

  it("만료된 ticket이면 401을 반환하고 profile sync를 시도하지 않는다", async () => {
    const ticket = await makeIssuedTicket();
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    const body = (await res.json()) as { message?: unknown };

    expect(res.status).toBe(401);
    expect(body.message).toBe("유효하지 않거나 만료된 ticket입니다.");
    expect(updateUserMock).not.toHaveBeenCalled();
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

  it("provider가 kakao가 아니면 400을 반환하고 profile sync를 시도하지 않는다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "naver:provider-mismatch",
      provider: "naver",
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
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

  it("profile sync 실패는 retryable 500을 반환하고 ticket을 finalized로 마감하지 않는다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "kakao:sync-fail",
      profilePayload: { email: "sync@example.com" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    updateUserMock.mockRejectedValueOnce(new Error("firebase update failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await POST(
        buildRequest({ ticketId: ticket.ticketId }) as never,
      );
      const body = (await res.json()) as {
        message?: unknown;
        retryable?: unknown;
      };

      expect(res.status).toBe(500);
      expect(body).toEqual({
        message: "로그인 마감 처리에 실패했습니다.",
        retryable: true,
      });
      expect(updateUserMock).toHaveBeenCalledWith(ticket.targetUid, {
        email: "sync@example.com",
      });
      const stored = await prisma.authHandoverTicket.findUnique({
        where: { ticketId: ticket.ticketId },
      });
      expect(stored).toMatchObject({
        status: "signed_in",
        finalizeAttemptCount: 1,
      });
      expect(stored?.lastFinalizeError).toContain("firebase update failed");
    } finally {
      errorSpy.mockRestore();
    }
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
