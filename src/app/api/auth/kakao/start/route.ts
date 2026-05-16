import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { buildKakaoAuthorizeUrl } from "@/lib/server/oauth/kakao-provider";
import { OAUTH_ATTEMPT_COOKIE } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 카카오 OAuth 흐름의 진입점. 익명 ID token을 검증하고 attempt를 만든 뒤
// 클라이언트가 redirect할 authorize URL을 응답한다.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }
  if (auth.signInProvider !== "anonymous") {
    return Response.json(
      { message: "이미 정식 계정으로 로그인되어 있습니다." },
      { status: 400 },
    );
  }

  const { attemptId, state } = await createAttempt({
    anonUid: auth.uid,
    provider: "kakao",
  });

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_ATTEMPT_COOKIE, attemptId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(OAUTH_ATTEMPT_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });

  let authorizeUrl: string;
  try {
    authorizeUrl = buildKakaoAuthorizeUrl({
      state,
      scope: "profile_nickname profile_image account_email",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[kakao start] buildAuthorizeUrl failed:", detail);
    return Response.json(
      { message: "카카오 로그인 환경 설정이 올바르지 않습니다." },
      { status: 500 },
    );
  }

  return Response.json({ authorizeUrl });
}
