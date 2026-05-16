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

// /callback 회귀 방지. 이번 reshape의 핵심 보장:
//   - state mismatch 시 ticket을 만들지 않고 error redirect
//   - 정상 흐름에서 ticket 생성 + handoverNonce cookie set + profilePayload 저장
//   - Firebase user record는 만들지 않는다 (createUser/updateUser 호출 없음)

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/server/oauth/kakao-provider", () => ({
  exchangeKakaoCode: vi.fn(),
  fetchKakaoUserInfo: vi.fn(),
}));

// firebase-admin이 임포트되더라도 createUser/updateUser/getUser가 호출되면
// 즉시 테스트가 실패하도록 한다.
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

    const res = await GET(
      buildRequest({ code: "any", state: "any" }),
    );

    expect(res.status).toBe(302);
    const sp = getRedirectParams(res);
    expect(sp.get("error")).toBe("missing_attempt");
  });

  it("state mismatch면 ticket을 만들지 않고 error redirect한다", async () => {
    const attempt = await createAttempt({
      anonUid: "anon-state",
      provider: "kakao",
    });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    const res = await GET(
      buildRequest({ code: "x", state: "WRONG-STATE" }),
    );

    expect(res.status).toBe(302);
    expect(getRedirectParams(res).get("error")).toBe("state_mismatch");

    // ticket이 생성되지 않았어야 한다.
    const tickets = await prisma.authHandoverTicket.findMany();
    expect(tickets).toHaveLength(0);

    // attempt cookie는 비웠어야 한다 (잔존 방지).
    expect(jar.has("oauth_attempt_id")).toBe(false);
  });

  it("정상 흐름에서 ticket을 생성하고 handoverNonce cookie를 세팅한다", async () => {
    const attempt = await createAttempt({
      anonUid: "anon-success",
      provider: "kakao",
    });
    const jar: CookieJar = new Map([["oauth_attempt_id", attempt.attemptId]]);
    cookiesMock.mockResolvedValue(
      makeCookieStore(jar) as unknown as Awaited<ReturnType<typeof cookies>>,
    );

    exchangeMock.mockResolvedValue({
      accessToken: "kakao-access-token",
      refreshToken: null,
      expiresIn: 3600,
      tokenType: "bearer",
    });
    fetchUserMock.mockResolvedValue({
      providerUserId: "999",
      email: "user@example.com",
      nickname: "테스트유저",
      profileImageUrl: "https://example.com/p.jpg",
      isEmailValid: true,
      isEmailVerified: true,
      emailNeedsAgreement: false,
    });

    const res = await GET(
      buildRequest({ code: "auth-code", state: attempt.state }),
    );

    expect(res.status).toBe(302);
    const sp = getRedirectParams(res);
    expect(sp.get("error")).toBeNull();
    const ticketId = sp.get("ticket");
    expect(ticketId).toBeTruthy();

    // ticket이 DB에 저장되고 profilePayload가 보존됐는지 확인.
    const ticket = await prisma.authHandoverTicket.findUnique({
      where: { ticketId: ticketId! },
    });
    expect(ticket).not.toBeNull();
    expect(ticket?.targetUid).toBe("kakao:999");
    expect(ticket?.status).toBe("pending");
    expect(ticket?.profilePayload).toEqual({
      email: "user@example.com",
      nickname: "테스트유저",
      photoUrl: "https://example.com/p.jpg",
    });

    // cookie에 handoverNonce가 ticket의 nonce와 같은 값으로 세팅됐는지.
    const cookieNonce = jar.get("oauth_handover_nonce");
    expect(cookieNonce).toBeTruthy();
    expect(cookieNonce).toBe(ticket?.handoverNonce);

    // attempt cookie는 비웠어야 한다.
    expect(jar.has("oauth_attempt_id")).toBe(false);

    // Firebase user 관련 호출이 일어나면 안 된다.
    expect(adminFail).not.toHaveBeenCalled();
  });
});
