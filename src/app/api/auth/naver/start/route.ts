import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { buildNaverAuthorizeUrl } from "@/lib/server/oauth/naver-provider";
import { OAUTH_ATTEMPT_COOKIE } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 네이버 OAuth 흐름의 진입점.
// 익명 흐름 제거 후 ID token 검증은 불필요(로그아웃 상태에서 /login의 네이버 버튼으로 진입).
export async function POST(_request: NextRequest) {
  void _request;

  const { attemptId, state } = await createAttempt({ provider: "naver" });

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
    authorizeUrl = buildNaverAuthorizeUrl({ state });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[naver start] buildAuthorizeUrl failed:", detail);
    return Response.json(
      { message: "네이버 로그인 환경 설정이 올바르지 않습니다." },
      { status: 500 },
    );
  }

  return Response.json({ authorizeUrl });
}
