import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("필수 파라미터가 누락되면 cookie를 비우고 provider API를 호출하지 않는다", async () => {
    const attempt = await createAttempt({ provider: "kakao" });
    const jar: CookieJar = new Map([
      ["oauth_attempt_id", attempt.attemptId],
      ["oauth_handover_nonce", "stale-handover"],
    ]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(buildRequest({ code: "auth-code" }));

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("invalid_callback");
    expect(jar.has("oauth_attempt_id")).toBe(false);
    expect(jar.has("oauth_handover_nonce")).toBe(false);
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(fetchUserMock).not.toHaveBeenCalled();
    expect(await prisma.authHandoverTicket.findMany()).toHaveLength(0);
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

  it("만료된 attempt면 invalid_attempt로 redirect하고 provider API를 호출하지 않는다", async () => {
    const attempt = await createAttempt({ provider: "kakao" });
    await prisma.oAuthAttempt.update({
      where: { attemptId: attempt.attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(
      buildRequest({ code: "auth-code", state: attempt.state }),
    );

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("invalid_attempt");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(fetchUserMock).not.toHaveBeenCalled();
    expect(await prisma.authHandoverTicket.findMany()).toHaveLength(0);
  });

  it("attempt provider가 kakao가 아니면 provider_mismatch로 error redirect한다", async () => {
    const attempt = await createAttempt({ provider: "naver" });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(
      buildRequest({ code: "x", state: attempt.state }),
    );

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("provider_mismatch");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(fetchUserMock).not.toHaveBeenCalled();
    expect(await prisma.authHandoverTicket.findMany()).toHaveLength(0);
  });

  it("카카오 API 호출 실패 시 ticket 없이 kakao_api_failed로 redirect한다", async () => {
    const attempt = await createAttempt({ provider: "kakao" });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );
    exchangeMock.mockRejectedValue(new Error("upstream down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      buildRequest({ code: "auth-code", state: attempt.state }),
    );

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("kakao_api_failed");
    expect(await prisma.authHandoverTicket.findMany()).toHaveLength(0);
  });

  it("카카오 userinfo 실패 시에도 ticket 없이 kakao_api_failed로 redirect한다", async () => {
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
    fetchUserMock.mockRejectedValue(new Error("userinfo down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      buildRequest({ code: "auth-code", state: attempt.state }),
    );

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("kakao_api_failed");
    expect(await prisma.authHandoverTicket.findMany()).toHaveLength(0);
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
