import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/naver/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
  type HandoverProfilePayload,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

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
  return new Request("http://localhost/api/auth/naver/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fake-id-token",
    },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string): Request {
  return new Request("http://localhost/api/auth/naver/finalize", {
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
    targetUid: overrides?.targetUid ?? "naver:42",
    provider: overrides?.provider ?? "naver",
    handoverNonce: overrides?.nonce ?? "valid-nonce",
    profilePayload: overrides?.profilePayload ?? { nickname: "테스트" },
  });
  await markTokenIssued(ticket.ticketId);
  return ticket;
}

describe("/api/auth/naver/finalize", () => {
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
    mockVerify("naver:42");

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
    const body = (await res.json()) as { message?: unknown };
    expect(res.status).toBe(401);
    expect(body.message).toBe("handover nonce 쿠키가 없습니다.");
  });

  it("nonce 불일치면 401", async () => {
    const ticket = await makeIssuedTicket({ nonce: "real" });
    mockVerify(ticket.targetUid);
    mockCookies("forged");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    const body = (await res.json()) as { message?: unknown };

    expect(res.status).toBe(401);
    expect(body.message).toBe("handover nonce가 일치하지 않습니다.");
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
    const ticket = await makeIssuedTicket({ targetUid: "naver:legit" });
    mockVerify("naver:attacker");
    mockCookies(ticket.handoverNonce);
    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    const body = (await res.json()) as { message?: unknown };
    expect(res.status).toBe(401);
    expect(body.message).toBe("ticket과 인증된 사용자가 일치하지 않습니다.");
  });

  it("provider가 naver가 아니면 400을 반환하고 profile sync를 시도하지 않는다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "kakao:provider-mismatch",
      provider: "kakao",
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    const body = (await res.json()) as { message?: unknown };

    expect(res.status).toBe(400);
    expect(body.message).toBe("provider가 일치하지 않습니다.");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("token 발급 전 pending ticket은 finalize를 거부한다", async () => {
    const ticket = await createTicket({
      targetUid: "naver:42",
      provider: "naver",
      handoverNonce: "valid-nonce",
      profilePayload: null,
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { message?: unknown };
    expect(body.message).toBe("Custom Token 발급이 먼저 필요합니다.");
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
    const body = (await res.json()) as {
      message?: unknown;
      retryable?: boolean;
    };
    expect(body.message).toBe(
      "재시도 횟수를 초과했습니다. 처음부터 다시 시도해 주세요.",
    );
    expect(body.retryable).toBe(false);
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

  it("profile sync 실패는 retryable 500을 반환하고 ticket을 finalized로 마감하지 않는다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "naver:sync-fail",
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
      expect(stored?.lastFinalizeError).toBe("finalize_failed");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("signed_in 상태 저장 실패는 profile sync 없이 안전한 500 message를 반환한다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "naver:sign-in-store-fail",
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    const transactionSpy = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(new Error("database offline"));
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
      expect(body.message).toBe("로그인 마감 처리에 실패했습니다.");
      expect(body.retryable).toBe(true);
      expect(String(body.message)).not.toContain("database offline");
      expect(updateUserMock).not.toHaveBeenCalled();
      await expect(
        prisma.authHandoverTicket.findUnique({
          where: { ticketId: ticket.ticketId },
        }),
      ).resolves.toMatchObject({ status: "token_issued" });
    } finally {
      transactionSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("finalized 상태 전이가 불가능하면 성공으로 보이지 않고 재시도 가능한 500을 반환한다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "naver:finalize-store-fail",
      profilePayload: { email: "sync@example.com" },
    });
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { status: "signed_in" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    updateUserMock.mockImplementationOnce(async () => {
      await prisma.authHandoverTicket.update({
        where: { ticketId: ticket.ticketId },
        data: { status: "pending" },
      });
      return {};
    });
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
      expect(body.message).toBe("로그인 마감 처리에 실패했습니다.");
      expect(body.retryable).toBe(true);
      expect(String(body.message)).not.toContain("markFinalized");
      await expect(
        prisma.authHandoverTicket.findUnique({
          where: { ticketId: ticket.ticketId },
        }),
      ).resolves.toMatchObject({
        status: "pending",
        finalizeAttemptCount: 1,
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("profile sync 실패 기록까지 실패해도 원시 DB 오류를 응답하지 않는다", async () => {
    const ticket = await makeIssuedTicket({
      targetUid: "naver:record-fail",
      profilePayload: { email: "sync@example.com" },
    });
    await prisma.authHandoverTicket.update({
      where: { ticketId: ticket.ticketId },
      data: { status: "signed_in" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);
    updateUserMock.mockRejectedValueOnce(new Error("firebase update failed"));
    const updateSpy = vi
      .spyOn(prisma.authHandoverTicket, "update")
      .mockRejectedValueOnce(new Error("record failed"));
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
      expect(body.message).toBe("로그인 마감 처리에 실패했습니다.");
      expect(body.retryable).toBe(true);
      expect(String(body.message)).not.toContain("record failed");
      await expect(
        prisma.authHandoverTicket.findUnique({
          where: { ticketId: ticket.ticketId },
        }),
      ).resolves.toMatchObject({
        status: "signed_in",
        finalizeAttemptCount: 0,
      });
    } finally {
      updateSpy.mockRestore();
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
