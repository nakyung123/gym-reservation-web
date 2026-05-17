import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/naver/callback/route";
import { createAttempt } from "@/lib/server/oauth/attempt-store";
import {
  exchangeNaverCode,
  fetchNaverUserInfo,
} from "@/lib/server/oauth/naver-provider";
import { prisma } from "@/lib/server/prisma-client";

// /api/auth/naver/callback 회귀 방지. 카카오 callback과 같은 정책 검증.

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/oauth/naver-provider", () => ({
  exchangeNaverCode: vi.fn(),
  fetchNaverUserInfo: vi.fn(),
}));

const adminFail = vi.fn(() => {
  throw new Error("callback은 Firebase user record를 만들지 않아야 한다");
});
vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({
    createUser: adminFail,
    updateUser: adminFail,
    getUser: adminFail,
  }),
}));

const cookiesMock = vi.mocked(cookies);
const exchangeMock = vi.mocked(exchangeNaverCode);
const fetchUserMock = vi.mocked(fetchNaverUserInfo);

type CookieJar = Map<string, string>;

function makeCookieStore(jar: CookieJar) {
  return {
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  };
}

function buildRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/auth/naver/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function getRedirectParams(res: Response): URLSearchParams {
  const loc = res.headers.get("location") ?? "";
  return new URL(loc).searchParams;
}

describe("/api/auth/naver/callback", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    exchangeMock.mockReset();
    fetchUserMock.mockReset();
    adminFail.mockClear();
  });

  it("state mismatch면 ticket을 만들지 않고 error redirect한다", async () => {
    const attempt = await createAttempt({
      anonUid: "anon-state-naver",
      provider: "naver",
    });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(buildRequest({ code: "x", state: "WRONG-STATE" }));
    expect(res.status).toBe(302);
    const sp = getRedirectParams(res);
    expect(sp.get("error")).toBe("state_mismatch");
    expect(sp.get("provider")).toBe("naver");

    const tickets = await prisma.authHandoverTicket.findMany();
    expect(tickets).toHaveLength(0);
  });

  it("정상 흐름에서 ticket과 handoverNonce cookie를 세팅한다 + Firebase user 호출 없음", async () => {
    const attempt = await createAttempt({
      anonUid: "anon-ok-naver",
      provider: "naver",
    });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    exchangeMock.mockResolvedValue({
      accessToken: "naver-access-token",
      refreshToken: null,
      expiresIn: 3600,
      tokenType: "bearer",
    });
    fetchUserMock.mockResolvedValue({
      providerUserId: "user-abc",
      email: "user@example.com",
      nickname: "네이버닉",
      name: "홍길동",
      profileImageUrl: "https://example.com/p.jpg",
    });

    const res = await GET(buildRequest({ code: "ac", state: attempt.state }));
    expect(res.status).toBe(302);
    const sp = getRedirectParams(res);
    expect(sp.get("provider")).toBe("naver");
    const ticketId = sp.get("ticket");
    expect(ticketId).toBeTruthy();

    const ticket = await prisma.authHandoverTicket.findUnique({
      where: { ticketId: ticketId! },
    });
    expect(ticket?.targetUid).toBe("naver:user-abc");
    expect(ticket?.profilePayload).toEqual({
      email: "user@example.com",
      nickname: "네이버닉",
      photoUrl: "https://example.com/p.jpg",
    });
    expect(jar.get("oauth_handover_nonce")).toBe(ticket?.handoverNonce);
    expect(adminFail).not.toHaveBeenCalled();
  });
});
