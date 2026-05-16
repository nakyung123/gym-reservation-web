import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { POST } from "@/app/api/auth/kakao/finalize/route";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import { prisma } from "@/lib/server/prisma-client";

// /finalize 보안 회귀 방지 테스트.
// 핵심 가드: nonce cookie 일치 + ticket.targetUid == 인증 uid 검증.
// 또한 사용자 결정 4번에 따라 신규/기존 판정이 이 transaction 안에서 일어남을 확인.

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  verifyIdTokenFromRequest: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({
    updateUser: vi.fn().mockResolvedValue({}),
  }),
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
  verifyMock.mockResolvedValue({
    ok: true,
    uid,
    signInProvider: "custom",
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

async function makeIssuedTicket(overrides?: {
  anonUid?: string;
  targetUid?: string;
  nonce?: string;
}) {
  const ticket = await createTicket({
    anonUid: overrides?.anonUid ?? "anon-uid",
    targetUid: overrides?.targetUid ?? "kakao:42",
    provider: "kakao",
    handoverNonce: overrides?.nonce ?? "valid-nonce",
    profilePayload: { nickname: "테스트" },
  });
  // 보안 테스트는 token_issued 상태 이상에서 일어나므로 미리 전이.
  await markTokenIssued(ticket.ticketId);
  return ticket;
}

describe("/api/auth/kakao/finalize", () => {
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

  it("handover nonce가 ticket과 불일치하면 401을 반환한다", async () => {
    const ticket = await makeIssuedTicket({ nonce: "real-nonce" });
    mockVerify(ticket.targetUid);
    mockCookies("forged-nonce");

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("인증된 uid가 ticket.targetUid와 다르면 401을 반환한다", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "kakao:legit" });
    mockVerify("kakao:attacker");
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("일치하지 않습니다");
  });

  it("신규 가입(target 데이터 0)이면 migration을 실행하고 transferred:true를 반환한다", async () => {
    const ticket = await makeIssuedTicket({
      anonUid: "anon-new",
      targetUid: "kakao:new",
    });
    // anon에 favorite 1개 심어둠.
    await prisma.favorite.create({
      data: { userId: "anon-new", gymId: "gym-test-1" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      transferred: boolean;
      profileSynced: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.transferred).toBe(true);

    const migrated = await prisma.favorite.findUnique({
      where: { userId_gymId: { userId: ticket.targetUid, gymId: "gym-test-1" } },
    });
    expect(migrated).not.toBeNull();
  });

  it("기존 가입(target에 데이터 있음) + confirmed:false면 409 conflict를 반환한다", async () => {
    const ticket = await makeIssuedTicket({ targetUid: "kakao:existing" });
    // target에 favorite 미리 만들어 "기존 사용자"로 보이게.
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

  it("기존 가입 + confirmed:true면 anon 데이터를 이전하지 않고 transferred:false로 성공한다", async () => {
    const ticket = await makeIssuedTicket({
      anonUid: "anon-skip",
      targetUid: "kakao:existing2",
    });
    await prisma.favorite.create({
      data: { userId: ticket.targetUid, gymId: "gym-test-1" },
    });
    await prisma.favorite.create({
      data: { userId: "anon-skip", gymId: "gym-test-1" },
    });
    mockVerify(ticket.targetUid);
    mockCookies(ticket.handoverNonce);

    const res = await POST(
      buildRequest({ ticketId: ticket.ticketId, confirmed: true }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transferred: boolean };
    expect(body.transferred).toBe(false);

    // anon 즐겨찾기는 그대로(이전 안 함).
    const anonFav = await prisma.favorite.findUnique({
      where: { userId_gymId: { userId: "anon-skip", gymId: "gym-test-1" } },
    });
    expect(anonFav).not.toBeNull();
  });
});
