import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { consumePendingAttempt } from "@/lib/server/oauth/attempt-store";
import { buildExternalAuthUid } from "@/lib/server/oauth/external-auth-uid";
import {
  createTicket,
  HANDOVER_TICKET_TTL_MS,
  type HandoverProfilePayload,
} from "@/lib/server/oauth/handover-ticket";
import {
  exchangeNaverCode,
  fetchNaverUserInfo,
  type NaverProfile,
} from "@/lib/server/oauth/naver-provider";
import {
  generateOpaqueToken,
  OAUTH_ATTEMPT_COOKIE,
  OAUTH_HANDOVER_COOKIE,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 네이버에서 돌아오는 redirect callback. 카카오 callback과 동형 구조.
// Firebase user record는 만들지 않는다. 신규/기존 판정과 createUser/updateUser는
// /finalize transaction에서 한다.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const origin = request.nextUrl.origin;

  const cookieStore = await cookies();
  const attemptCookie = cookieStore.get(OAUTH_ATTEMPT_COOKIE);
  if (attemptCookie) {
    cookieStore.delete(OAUTH_ATTEMPT_COOKIE);
  }
  cookieStore.delete(OAUTH_HANDOVER_COOKIE);

  if (oauthError) {
    return errorRedirect(origin, "naver_oauth_error", oauthError);
  }
  if (!code || !state) {
    return errorRedirect(
      origin,
      "invalid_callback",
      "필수 파라미터가 누락됐습니다.",
    );
  }
  if (!attemptCookie) {
    return errorRedirect(
      origin,
      "missing_attempt",
      "로그인 attempt 쿠키가 없습니다.",
    );
  }

  const attempt = await consumePendingAttempt(attemptCookie.value);
  if (!attempt) {
    return errorRedirect(
      origin,
      "invalid_attempt",
      "유효하지 않은 로그인 attempt입니다.",
    );
  }
  if (!safeEqualToken(state, attempt.state)) {
    return errorRedirect(
      origin,
      "state_mismatch",
      "state 값이 일치하지 않습니다.",
    );
  }
  if (attempt.provider !== "naver") {
    return errorRedirect(
      origin,
      "provider_mismatch",
      "provider가 일치하지 않습니다.",
    );
  }

  let naverProfile: NaverProfile;
  try {
    // 네이버는 token 교환 시 state도 함께 요구한다.
    const tokenSet = await exchangeNaverCode(code, state);
    naverProfile = await fetchNaverUserInfo(tokenSet.accessToken);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[naver callback] token/userinfo failed:", detail);
    return errorRedirect(
      origin,
      "naver_api_failed",
      "네이버 인증에 실패했습니다.",
    );
  }

  const targetUid = buildExternalAuthUid("naver", naverProfile.providerUserId);
  const handoverNonce = generateOpaqueToken();
  const profilePayload = toProfilePayload(naverProfile);

  const ticket = await createTicket({
    targetUid,
    provider: "naver",
    handoverNonce,
    profilePayload,
  });

  cookieStore.set(OAUTH_HANDOVER_COOKIE, handoverNonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(HANDOVER_TICKET_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });

  const url = buildHandoverRedirect(origin, {
    ticket: ticket.ticketId,
    provider: "naver",
  });
  return Response.redirect(url, 302);
}

function toProfilePayload(profile: NaverProfile): HandoverProfilePayload | null {
  const payload: HandoverProfilePayload = {};
  if (profile.email) payload.email = profile.email;
  // 네이버는 nickname과 name이 따로 있다. UI 표시명은 nickname 우선, 없으면 name.
  const displayName = profile.nickname ?? profile.name;
  if (displayName) payload.nickname = displayName;
  if (profile.profileImageUrl) payload.photoUrl = profile.profileImageUrl;
  return Object.keys(payload).length === 0 ? null : payload;
}

function buildHandoverRedirect(
  origin: string,
  params: Record<string, string>,
): URL {
  const url = new URL("/auth/handover", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function errorRedirect(
  origin: string,
  code: string,
  description: string,
): Response {
  const url = buildHandoverRedirect(origin, {
    error: code,
    error_description: description,
    provider: "naver",
  });
  return Response.redirect(url, 302);
}
