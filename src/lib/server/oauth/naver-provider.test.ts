import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildNaverAuthorizeUrl,
  exchangeNaverCode,
  fetchNaverUserInfo,
  normalizeNaverUserInfo,
} from "@/lib/server/oauth/naver-provider";

describe("buildNaverAuthorizeUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = "test-client-id";
    process.env.NAVER_CLIENT_SECRET = "test-secret";
    process.env.NAVER_REDIRECT_URI =
      "http://localhost:3000/api/auth/naver/callback";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("필수 파라미터를 포함한 authorize URL을 만든다", () => {
    const url = new URL(buildNaverAuthorizeUrl({ state: "abc" }));
    expect(url.origin + url.pathname).toBe(
      "https://nid.naver.com/oauth2.0/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/naver/callback",
    );
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("환경 변수가 비어 있으면 오류를 던진다", () => {
    delete process.env.NAVER_CLIENT_ID;
    expect(() => buildNaverAuthorizeUrl({ state: "abc" })).toThrow(/설정/);
  });
});

describe("normalizeNaverUserInfo", () => {
  it("response.id를 string으로 정규화하고 email을 평탄화한다", () => {
    const profile = normalizeNaverUserInfo({
      resultcode: "00",
      message: "success",
      response: {
        id: "abc-9999",
        email: "user@example.com",
      },
    });
    expect(profile.providerUserId).toBe("abc-9999");
    expect(profile.email).toBe("user@example.com");
  });

  it("id 양옆 공백을 제거한다", () => {
    const profile = normalizeNaverUserInfo({
      resultcode: "00",
      response: { id: "  trim-me  " },
    });
    expect(profile.providerUserId).toBe("trim-me");
  });

  it("email이 비어 있으면 null로 반환한다", () => {
    const profile = normalizeNaverUserInfo({
      resultcode: "00",
      response: { id: "1" },
    });
    expect(profile.email).toBeNull();
  });

  it("resultcode가 00이 아니면 오류로 던진다", () => {
    expect(() =>
      normalizeNaverUserInfo({
        resultcode: "024",
        message: "Authentication failed",
        response: {},
      }),
    ).toThrow(/오류/);
  });

  it("response 본문이 없으면 오류", () => {
    expect(() => normalizeNaverUserInfo({ resultcode: "00" })).toThrow(/본문/);
  });

  it("id가 없으면 오류", () => {
    expect(() =>
      normalizeNaverUserInfo({ resultcode: "00", response: {} }),
    ).toThrow(/id/);
    expect(() =>
      normalizeNaverUserInfo({
        resultcode: "00",
        response: { id: "   " },
      }),
    ).toThrow(/id/);
  });

  it("객체가 아닌 응답은 오류", () => {
    expect(() => normalizeNaverUserInfo(null)).toThrow(/응답/);
    expect(() => normalizeNaverUserInfo("text")).toThrow(/응답/);
  });
});

describe("exchangeNaverCode", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = "c";
    process.env.NAVER_CLIENT_SECRET = "s";
    process.env.NAVER_REDIRECT_URI = "http://localhost/cb";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("정상 응답을 NaverTokenSet으로 변환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        token_type: "bearer",
      }),
    }) as unknown as typeof fetch;

    const result = await exchangeNaverCode("code-123", "state-xyz");
    expect(result).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      expiresIn: 3600,
      tokenType: "bearer",
    });
  });

  it("expires_in이 string으로 와도 number로 정규화한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "AT", expires_in: "3600" }),
    }) as unknown as typeof fetch;
    const result = await exchangeNaverCode("c", "s");
    expect(result.expiresIn).toBe(3600);
  });

  it("ok=false 응답은 오류", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(exchangeNaverCode("bad", "s")).rejects.toThrow(/토큰 발급/);
  });

  it("응답에 error 필드가 있으면 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "invalid_request" }),
    }) as unknown as typeof fetch;
    await expect(exchangeNaverCode("c", "s")).rejects.toThrow(/오류/);
  });

  it("access_token이 없으면 오류", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ expires_in: 100 }),
    }) as unknown as typeof fetch;
    await expect(exchangeNaverCode("c", "s")).rejects.toThrow(/응답/);
  });
});

describe("fetchNaverUserInfo", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("정상 응답을 NaverProfile로 정규화한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          resultcode: "00",
          response: {
            id: "user-1",
            email: "a@b.com",
          },
        }),
    }) as unknown as typeof fetch;
    const profile = await fetchNaverUserInfo("AT");
    expect(profile.providerUserId).toBe("user-1");
    expect(profile.email).toBe("a@b.com");
  });

  it("ok=false 응답은 오류", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "",
    }) as unknown as typeof fetch;
    await expect(fetchNaverUserInfo("AT")).rejects.toThrow(/사용자 정보/);
  });

  it("JSON 파싱 실패는 명확한 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "not-json",
    }) as unknown as typeof fetch;
    await expect(fetchNaverUserInfo("AT")).rejects.toThrow(/해석/);
  });
});
