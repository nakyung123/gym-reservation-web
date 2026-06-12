import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { buildKakaoAuthorizeUrl } from "@/lib/server/oauth/kakao-provider";
import { OAUTH_ATTEMPT_COOKIE } from "@/lib/server/oauth/oauth-state";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const KAKAO_LOGIN_UNAVAILABLE_MESSAGE =
  "카카오 로그인을 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.";

// 카카오 OAuth 흐름의 진입점.
// 익명 흐름 제거 후 ID token 검증은 불필요(로그아웃 상태에서 /login의 카카오 버튼으로 진입).
export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  const ipLimit = await checkRateLimit({
    scope: "oauth-start:ip",
    identifier: ip,
    limit: 10,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const providerLimit = await checkRateLimit({
    scope: "oauth-start:provider",
    identifier: "kakao",
    limit: 200,
    windowMs: 60_000,
  });
  if (!providerLimit.ok) return rateLimitedJsonResponse(providerLimit);

  try {
    const { attemptId, state } = await createAttempt({ provider: "kakao" });

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_ATTEMPT_COOKIE, attemptId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(OAUTH_ATTEMPT_TTL_MS / 1000),
      secure: process.env.NODE_ENV === "production",
    });

    // 닉네임/프로필 사진은 사용하지 않으므로 동의 scope를 요청하지 않는다.
    // account_email도 카카오 검수 전이라 요청하지 않는다.
    // 식별은 카카오 회원번호(id)만으로 충분하다 (buildExternalAuthUid 참고).
    const authorizeUrl = buildKakaoAuthorizeUrl({ state });

    return Response.json({ authorizeUrl });
  } catch {
    console.error("[kakao start] failed");
    return Response.json(
      { message: KAKAO_LOGIN_UNAVAILABLE_MESSAGE },
      { status: 500 },
    );
  }
}
