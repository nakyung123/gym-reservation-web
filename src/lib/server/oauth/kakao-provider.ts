import "server-only";

// 카카오 로그인 REST API 흐름의 서버 측 구현.
// authorize URL 생성 → code ↔ token 교환 → user info 조회.
// user info의 id는 number 타입이지만 안전 정수 범위 이슈를 피하기 위해 항상 string으로 정규화한다.

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me";

export type KakaoTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  tokenType: string;
};

export type KakaoProfile = {
  providerUserId: string;
  email: string | null;
  isEmailValid: boolean;
  isEmailVerified: boolean;
  emailNeedsAgreement: boolean;
};

function requireEnv(): { restApiKey: string; redirectUri: string } {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  const redirectUri = process.env.KAKAO_REDIRECT_URI;
  if (!restApiKey || !redirectUri) {
    throw new Error(
      "KAKAO_REST_API_KEY 또는 KAKAO_REDIRECT_URI 환경 변수가 설정되어 있지 않습니다.",
    );
  }
  return { restApiKey, redirectUri };
}

export function buildKakaoAuthorizeUrl(params: {
  state: string;
  scope?: string;
}): string {
  const { restApiKey, redirectUri } = requireEnv();
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", restApiKey);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", params.state);
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  return url.toString();
}

export async function exchangeKakaoCode(code: string): Promise<KakaoTokenSet> {
  const { restApiKey, redirectUri } = requireEnv();
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `카카오 토큰 발급에 실패했습니다. status=${response.status}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("카카오 토큰 응답이 올바르지 않습니다.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
    tokenType: data.token_type ?? "bearer",
  };
}

export async function fetchKakaoUserInfo(
  accessToken: string,
): Promise<KakaoProfile> {
  const response = await fetch(KAKAO_USER_INFO_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `카카오 사용자 정보 조회에 실패했습니다. status=${response.status}`,
    );
  }

  // raw text를 파싱한 뒤 id는 String()으로 정규화한다.
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("카카오 사용자 정보 응답을 해석하지 못했습니다.");
  }

  return normalizeKakaoUserInfo(parsed);
}

// 응답 normalization은 테스트가 쉽도록 export해 단위 테스트에서 직접 사용한다.
export function normalizeKakaoUserInfo(raw: unknown): KakaoProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("카카오 사용자 정보 응답이 올바르지 않습니다.");
  }

  const data = raw as {
    id?: unknown;
    kakao_account?: {
      email?: unknown;
      is_email_valid?: unknown;
      is_email_verified?: unknown;
      email_needs_agreement?: unknown;
    };
  };

  if (data.id === undefined || data.id === null) {
    throw new Error("카카오 사용자 id가 비어 있습니다.");
  }

  const providerUserId = String(data.id).trim();
  if (providerUserId.length === 0) {
    throw new Error("카카오 사용자 id가 비어 있습니다.");
  }

  const account = data.kakao_account ?? {};

  return {
    providerUserId,
    email:
      typeof account.email === "string" && account.email.length > 0
        ? account.email
        : null,
    isEmailValid:
      typeof account.is_email_valid === "boolean"
        ? account.is_email_valid
        : false,
    isEmailVerified:
      typeof account.is_email_verified === "boolean"
        ? account.is_email_verified
        : false,
    emailNeedsAgreement:
      typeof account.email_needs_agreement === "boolean"
        ? account.email_needs_agreement
        : false,
  };
}
