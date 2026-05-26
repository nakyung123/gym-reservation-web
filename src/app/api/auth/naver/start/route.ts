import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { buildNaverAuthorizeUrl } from "@/lib/server/oauth/naver-provider";
import { OAUTH_ATTEMPT_COOKIE } from "@/lib/server/oauth/oauth-state";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const NAVER_LOGIN_UNAVAILABLE_MESSAGE =
  "네이버 로그인을 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.";

// 네이버 OAuth 흐름의 진입점.
// 익명 흐름 제거 후 ID token 검증은 불필요(로그아웃 상태에서 /login의 네이버 버튼으로 진입).
export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit({
    scope: "oauth-start:ip",
    identifier: extractClientIp(request.headers),
    limit: 10,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const providerLimit = await checkRateLimit({
    scope: "oauth-start:provider",
    identifier: "naver",
    limit: 200,
    windowMs: 60_000,
  });
  if (!providerLimit.ok) return rateLimitedJsonResponse(providerLimit);

  try {
    const { attemptId, state } = await createAttempt({ provider: "naver" });

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_ATTEMPT_COOKIE, attemptId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(OAUTH_ATTEMPT_TTL_MS / 1000),
      secure: process.env.NODE_ENV === "production",
    });

    const authorizeUrl = buildNaverAuthorizeUrl({ state });

    return Response.json({ authorizeUrl });
  } catch {
    console.error("[naver start] failed");
    return Response.json(
      { message: NAVER_LOGIN_UNAVAILABLE_MESSAGE },
      { status: 500 },
    );
  }
}
