import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createAttempt,
  OAUTH_ATTEMPT_TTL_MS,
} from "@/lib/server/oauth/attempt-store";
import { buildKakaoAuthorizeUrl } from "@/lib/server/oauth/kakao-provider";
import { OAUTH_ATTEMPT_COOKIE } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 카카오 OAuth 흐름의 진입점.
// 익명 흐름 제거 후 ID token 검증은 불필요(로그아웃 상태에서 /login의 카카오 버튼으로 진입).
export async function POST(_request: NextRequest) {
  void _request;

  const { attemptId, state } = await createAttempt({ provider: "kakao" });

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
    // account_email은 카카오 검수 통과 후에만 사용 가능한 동의 항목이라 제외한다.
    // 식별은 카카오 회원번호(id)만으로 충분하다 (buildExternalAuthUid 참고).
    authorizeUrl = buildKakaoAuthorizeUrl({
      state,
      scope: "profile_nickname profile_image",
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
