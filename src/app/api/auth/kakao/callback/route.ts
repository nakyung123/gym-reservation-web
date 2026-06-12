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
  exchangeKakaoCode,
  fetchKakaoUserInfo,
  type KakaoProfile,
} from "@/lib/server/oauth/kakao-provider";
import {
  generateOpaqueToken,
  OAUTH_ATTEMPT_COOKIE,
  OAUTH_HANDOVER_COOKIE,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";
import {
  checkRateLimit,
  extractClientIp,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const PROVIDER_OAUTH_ERROR_MESSAGE =
  "카카오 로그인 요청이 취소되었거나 실패했습니다.";

// 카카오에서 돌아오는 redirect callback. 헤더 Authorization은 붙지 않는다.
// 신뢰 가능한 식별 정보는 cookie attemptId만으로, 거기서 anonUid를 얻는다.
// 흐름: state 검증 → attempt 1회 소비 → 토큰/유저정보 → handoverNonce 발급
// → ticket 생성(provider profile 저장) → handover cookie set → /auth/handover로
// ticket만 노출하는 302 redirect.
// Firebase user record는 만들지 않는다. 신규/기존 판정과 createUser/updateUser는
// /finalize transaction에서 한다.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const origin = request.nextUrl.origin;

  // callback은 provider redirect라 정상 사용자는 1~2회만 호출. IP 기반으로 폭주만 차단.
  const ipLimit = await checkRateLimit({
    scope: "oauth-callback:ip",
    identifier: extractClientIp(request.headers),
    limit: 30,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) {
    return errorRedirect(
      origin,
      "rate_limited",
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const cookieStore = await cookies();
  const attemptCookie = cookieStore.get(OAUTH_ATTEMPT_COOKIE);
  // state mismatch나 실패 시에도 cookie 잔존 방지를 위해 일찍 비운다.
  if (attemptCookie) {
    cookieStore.delete(OAUTH_ATTEMPT_COOKIE);
  }
  // 이전 흐름에 떠 있던 handover cookie도 새 ticket 발급 전 비운다.
  cookieStore.delete(OAUTH_HANDOVER_COOKIE);

  if (oauthError) {
    return errorRedirect(
      origin,
      "kakao_oauth_error",
      PROVIDER_OAUTH_ERROR_MESSAGE,
    );
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
  if (attempt.provider !== "kakao") {
    return errorRedirect(
      origin,
      "provider_mismatch",
      "provider가 일치하지 않습니다.",
    );
  }

  let kakaoProfile: KakaoProfile;
  try {
    const tokenSet = await exchangeKakaoCode(code);
    kakaoProfile = await fetchKakaoUserInfo(tokenSet.accessToken);
  } catch {
    console.error("[kakao callback] token/userinfo failed");
    return errorRedirect(
      origin,
      "kakao_api_failed",
      "카카오 인증에 실패했습니다.",
    );
  }

  // 이메일은 카카오 검수 통과 후에만 사용 가능한 항목이라 MVP에서는 받지 않는다.
  // 식별은 카카오 회원번호(id)만으로 충분하다.
  const targetUid = buildExternalAuthUid("kakao", kakaoProfile.providerUserId);
  const handoverNonce = generateOpaqueToken();
  const profilePayload = toProfilePayload(kakaoProfile);

  let ticket: Awaited<ReturnType<typeof createTicket>>;
  try {
    ticket = await createTicket({
      targetUid,
      provider: "kakao",
      handoverNonce,
      profilePayload,
    });
  } catch {
    console.error("[kakao callback] ticket creation failed");
    return errorRedirect(
      origin,
      "handover_ticket_failed",
      "로그인 티켓 발급에 실패했습니다.",
    );
  }

  cookieStore.set(OAUTH_HANDOVER_COOKIE, handoverNonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(HANDOVER_TICKET_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });

  const url = buildHandoverRedirect(origin, {
    ticket: ticket.ticketId,
    provider: "kakao",
  });
  return Response.redirect(url, 302);
}

function toProfilePayload(profile: KakaoProfile): HandoverProfilePayload | null {
  // email만 finalize에서 admin.updateUser에 쓰인다. provider의 nickname/사진은 동기화하지 않는다.
  if (!profile.email) return null;
  return { email: profile.email };
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
    provider: "kakao",
  });
  return Response.redirect(url, 302);
}
