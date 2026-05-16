import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildKakaoAuthorizeUrl,
  exchangeKakaoCode,
  fetchKakaoUserInfo,
  normalizeKakaoUserInfo,
} from "@/lib/server/oauth/kakao-provider";

describe("buildKakaoAuthorizeUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = "test-rest-key";
    process.env.KAKAO_REDIRECT_URI = "http://localhost:3000/api/auth/kakao/callback";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("필수 파라미터를 포함한 authorize URL을 만든다", () => {
    const url = new URL(buildKakaoAuthorizeUrl({ state: "abc" }));
    expect(url.origin + url.pathname).toBe(
      "https://kauth.kakao.com/oauth/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-rest-key");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/kakao/callback",
    );
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("scope가 주어지면 URL에 포함된다", () => {
    const url = new URL(
      buildKakaoAuthorizeUrl({ state: "abc", scope: "profile_nickname account_email" }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "profile_nickname account_email",
    );
  });

  it("환경 변수가 비어 있으면 오류를 던진다", () => {
    delete process.env.KAKAO_REST_API_KEY;
    expect(() => buildKakaoAuthorizeUrl({ state: "abc" })).toThrow(
      /환경 변수/,
    );
  });
});

describe("normalizeKakaoUserInfo", () => {
  it("number id를 string으로 정규화하고 profile/kakao_account 필드를 평탄화한다", () => {
    const profile = normalizeKakaoUserInfo({
      id: 123456789,
      kakao_account: {
        email: "user@example.com",
        is_email_valid: true,
        is_email_verified: true,
        email_needs_agreement: false,
        profile: {
          nickname: "닉",
          profile_image_url: "https://k.example/pic.jpg",
        },
      },
    });
    expect(profile.providerUserId).toBe("123456789");
    expect(profile.email).toBe("user@example.com");
    expect(profile.isEmailValid).toBe(true);
    expect(profile.isEmailVerified).toBe(true);
    expect(profile.emailNeedsAgreement).toBe(false);
    expect(profile.nickname).toBe("닉");
    expect(profile.profileImageUrl).toBe("https://k.example/pic.jpg");
  });

  it("id가 string으로 와도 그대로 정규화한다", () => {
    const profile = normalizeKakaoUserInfo({ id: "  9876  " });
    expect(profile.providerUserId).toBe("9876");
  });

  it("kakao_account가 비어 있으면 모든 옵셔널 필드는 null/false 기본값", () => {
    const profile = normalizeKakaoUserInfo({ id: 1 });
    expect(profile.email).toBeNull();
    expect(profile.isEmailValid).toBe(false);
    expect(profile.isEmailVerified).toBe(false);
    expect(profile.emailNeedsAgreement).toBe(false);
    expect(profile.nickname).toBeNull();
    expect(profile.profileImageUrl).toBeNull();
  });

  it("deprecated properties.* 경로는 무시되고 kakao_account.profile.*만 사용된다", () => {
    const profile = normalizeKakaoUserInfo({
      id: 1,
      properties: { nickname: "구버전닉", profile_image: "https://old/img" },
      kakao_account: { profile: { nickname: "신버전닉" } },
    });
    expect(profile.nickname).toBe("신버전닉");
    expect(profile.profileImageUrl).toBeNull();
  });

  it("id 누락은 오류", () => {
    expect(() => normalizeKakaoUserInfo({})).toThrow(/id/);
    expect(() => normalizeKakaoUserInfo({ id: "  " })).toThrow(/id/);
  });

  it("객체가 아닌 응답은 오류", () => {
    expect(() => normalizeKakaoUserInfo(null)).toThrow(/응답/);
    expect(() => normalizeKakaoUserInfo("string")).toThrow(/응답/);
  });
});

describe("exchangeKakaoCode", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = "k";
    process.env.KAKAO_REDIRECT_URI = "http://localhost/cb";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("정상 응답을 KakaoTokenSet으로 변환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        token_type: "bearer",
      }),
    }) as unknown as typeof fetch;

    const result = await exchangeKakaoCode("code-123");
    expect(result).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      expiresIn: 3600,
      tokenType: "bearer",
    });
  });

  it("ok=false 응답은 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(exchangeKakaoCode("bad")).rejects.toThrow(/토큰 발급/);
  });

  it("access_token이 없으면 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ expires_in: 100 }),
    }) as unknown as typeof fetch;
    await expect(exchangeKakaoCode("c")).rejects.toThrow(/응답/);
  });
});

describe("fetchKakaoUserInfo", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("정상 응답을 KakaoProfile로 정규화한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: 42,
          kakao_account: { email: "a@b.com", profile: { nickname: "n" } },
        }),
    }) as unknown as typeof fetch;
    const profile = await fetchKakaoUserInfo("AT");
    expect(profile.providerUserId).toBe("42");
    expect(profile.email).toBe("a@b.com");
    expect(profile.nickname).toBe("n");
  });

  it("ok=false 응답은 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "",
    }) as unknown as typeof fetch;
    await expect(fetchKakaoUserInfo("AT")).rejects.toThrow(/사용자 정보/);
  });

  it("JSON 파싱 실패는 명확한 오류로 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "not-json",
    }) as unknown as typeof fetch;
    await expect(fetchKakaoUserInfo("AT")).rejects.toThrow(/해석/);
  });
});
