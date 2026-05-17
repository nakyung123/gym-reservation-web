import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/kakao/callback/route";
import { createAttempt } from "@/lib/server/oauth/attempt-store";
import {
  exchangeKakaoCode,
  fetchKakaoUserInfo,
} from "@/lib/server/oauth/kakao-provider";
import { prisma } from "@/lib/server/prisma-client";

// /api/auth/kakao/callback 회귀 방지.
// 핵심 보장: state mismatch 시 ticket을 만들지 않고 error redirect, 정상 흐름에서
// ticket+nonce cookie 발급, Firebase user record를 만들지 않는다 (createUser/updateUser/getUser 호출 0회).

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/oauth/kakao-provider", () => ({
  exchangeKakaoCode: vi.fn(),
  fetchKakaoUserInfo: vi.fn(),
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
const exchangeMock = vi.mocked(exchangeKakaoCode);
const fetchUserMock = vi.mocked(fetchKakaoUserInfo);

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
  const url = new URL("http://localhost/api/auth/kakao/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function getRedirectParams(res: Response): URLSearchParams {
  const loc = res.headers.get("location") ?? "";
  return new URL(loc).searchParams;
}

describe("/api/auth/kakao/callback", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    exchangeMock.mockReset();
    fetchUserMock.mockReset();
    adminFail.mockClear();
  });

  it("attempt cookie가 없으면 missing_attempt로 error redirect한다", async () => {
    cookiesMock.mockResolvedValue(
      makeCookieStore(new Map()) as unknown as Awaited<
        ReturnType<typeof cookies>
      >,
    );
    const res = await GET(buildRequest({ code: "x", state: "y" }));
    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("missing_attempt");
  });

  it("state mismatch면 ticket을 만들지 않고 error redirect한다", async () => {
    const attempt = await createAttempt({ provider: "kakao" });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(
      buildRequest({ code: "x", state: "WRONG-STATE" }),
    );
    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("state_mismatch");

    const tickets = await prisma.authHandoverTicket.findMany();
    expect(tickets).toHaveLength(0);
    expect(jar.has("oauth_attempt_id")).toBe(false);
  });

  it("정상 흐름에서 ticket+handoverNonce cookie를 발급하고 Firebase user는 만들지 않는다", async () => {
    const attempt = await createAttempt({ provider: "kakao" });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    exchangeMock.mockResolvedValue({
      accessToken: "kakao-at",
      refreshToken: null,
      expiresIn: 3600,
      tokenType: "bearer",
    });
    fetchUserMock.mockResolvedValue({
      providerUserId: "999",
      email: "user@example.com",
      nickname: "테스트",
      profileImageUrl: "https://e/p.jpg",
      isEmailValid: true,
      isEmailVerified: true,
      emailNeedsAgreement: false,
    });

    const res = await GET(
      buildRequest({ code: "auth-code", state: attempt.state }),
    );
    expect(res.status).toBe(302);
    const sp = getRedirectParams(res);
    expect(sp.get("provider")).toBe("kakao");
    const ticketId = sp.get("ticket");
    expect(ticketId).toBeTruthy();

    const ticket = await prisma.authHandoverTicket.findUnique({
      where: { ticketId: ticketId! },
    });
    expect(ticket?.targetUid).toBe("kakao:999");
    expect(ticket?.status).toBe("pending");
    expect(jar.get("oauth_handover_nonce")).toBe(ticket?.handoverNonce);
    expect(jar.has("oauth_attempt_id")).toBe(false);
    expect(adminFail).not.toHaveBeenCalled();
  });
});
