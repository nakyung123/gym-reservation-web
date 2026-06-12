import "server-only";

// 네이버 로그인 REST API 흐름의 서버 측 구현.
// authorize URL 생성 → code ↔ token 교환 → user info 조회.
// 응답의 id는 항상 string이지만 외부 가정 변동을 흡수하기 위해 String()으로 정규화한다.
// 이메일은 네이버에서 별도 검수 없이 받을 수 있어 동의 항목으로 요청한다.

const NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const NAVER_USER_INFO_URL = "https://openapi.naver.com/v1/nid/me";

export type NaverTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  tokenType: string;
};

export type NaverProfile = {
  providerUserId: string;
  email: string | null;
};

function requireEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const redirectUri = process.env.NAVER_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REDIRECT_URI 중 하나 이상이 설정되어 있지 않습니다.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildNaverAuthorizeUrl(params: { state: string }): string {
  const { clientId, redirectUri } = requireEnv();
  const url = new URL(NAVER_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeNaverCode(
  code: string,
  state: string,
): Promise<NaverTokenSet> {
  const { clientId, clientSecret, redirectUri } = requireEnv();

  // 네이버는 client_secret도 token 교환 시 필수.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    state,
  });

  const response = await fetch(NAVER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `네이버 토큰 발급에 실패했습니다. status=${response.status}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number | string;
    token_type?: string;
    error?: string;
  };

  if (data.error) {
    throw new Error(`네이버 토큰 발급 오류: ${data.error}`);
  }

  const expiresInRaw = data.expires_in;
  const expiresIn =
    typeof expiresInRaw === "number"
      ? expiresInRaw
      : typeof expiresInRaw === "string"
        ? Number.parseInt(expiresInRaw, 10)
        : NaN;

  if (!data.access_token || !Number.isFinite(expiresIn)) {
    throw new Error("네이버 토큰 응답이 올바르지 않습니다.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn,
    tokenType: data.token_type ?? "bearer",
  };
}

export async function fetchNaverUserInfo(
  accessToken: string,
): Promise<NaverProfile> {
  const response = await fetch(NAVER_USER_INFO_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `네이버 사용자 정보 조회에 실패했습니다. status=${response.status}`,
    );
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("네이버 사용자 정보 응답을 해석하지 못했습니다.");
  }

  return normalizeNaverUserInfo(parsed);
}

// 응답 normalization은 테스트가 쉽도록 export. 네이버 응답 구조는
// { resultcode, message, response: { id, email, ... } }. email만 사용한다.
export function normalizeNaverUserInfo(raw: unknown): NaverProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("네이버 사용자 정보 응답이 올바르지 않습니다.");
  }

  const envelope = raw as {
    resultcode?: unknown;
    message?: unknown;
    response?: unknown;
  };

  if (envelope.resultcode !== undefined && envelope.resultcode !== "00") {
    const detail =
      typeof envelope.message === "string"
        ? envelope.message
        : String(envelope.resultcode);
    throw new Error(`네이버 사용자 정보 응답이 오류입니다: ${detail}`);
  }

  const response = envelope.response;
  if (!response || typeof response !== "object") {
    throw new Error("네이버 사용자 정보 본문이 비어 있습니다.");
  }

  const data = response as {
    id?: unknown;
    email?: unknown;
  };

  if (data.id === undefined || data.id === null) {
    throw new Error("네이버 사용자 id가 비어 있습니다.");
  }

  const providerUserId = String(data.id).trim();
  if (providerUserId.length === 0) {
    throw new Error("네이버 사용자 id가 비어 있습니다.");
  }

  return {
    providerUserId,
    email:
      typeof data.email === "string" && data.email.length > 0
        ? data.email
        : null,
  };
}
