import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import { consumePendingAttempt } from "@/lib/server/oauth/attempt-store";
import { buildExternalAuthUid } from "@/lib/server/oauth/external-auth-uid";
import { createTicket } from "@/lib/server/oauth/handover-ticket";
import {
  exchangeKakaoCode,
  fetchKakaoUserInfo,
  type KakaoProfile,
} from "@/lib/server/oauth/kakao-provider";
import {
  OAUTH_ATTEMPT_COOKIE,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 카카오에서 돌아오는 redirect callback. 헤더 Authorization은 붙지 않는다.
// 신뢰 가능한 식별 정보는 cookie attemptId만으로, 거기서 anonUid를 얻는다.
// 흐름: state 검증 → attempt 1회 소비 → 토큰/유저정보 → user record 생성/갱신
// → handover ticket 생성 → /auth/handover로 ticket만 노출하는 302 redirect.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const origin = request.nextUrl.origin;

  const cookieStore = await cookies();
  const attemptCookie = cookieStore.get(OAUTH_ATTEMPT_COOKIE);
  // state mismatch나 실패 시에도 cookie 잔존 방지를 위해 일찍 비운다.
  if (attemptCookie) {
    cookieStore.delete(OAUTH_ATTEMPT_COOKIE);
  }

  if (oauthError) {
    return errorRedirect(origin, "kakao_oauth_error", oauthError);
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[kakao callback] token/userinfo failed:", detail);
    return errorRedirect(
      origin,
      "kakao_api_failed",
      "카카오 인증에 실패했습니다.",
    );
  }

  // 이메일 동의 정책: emailNeedsAgreement=true면 식별이 불완전하므로 가입 거부.
  if (kakaoProfile.emailNeedsAgreement) {
    return errorRedirect(
      origin,
      "email_consent_required",
      "이메일 제공 동의가 필요합니다.",
    );
  }

  const targetUid = buildExternalAuthUid("kakao", kakaoProfile.providerUserId);

  // Firebase user record 존재 여부로 신규/기존 가입 판정.
  let userExists = false;
  try {
    await getAdminAuth().getUser(targetUid);
    userExists = true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code !== "auth/user-not-found") {
      console.error("[kakao callback] getUser failed:", error);
      return errorRedirect(
        origin,
        "user_lookup_failed",
        "사용자 조회에 실패했습니다.",
      );
    }
  }

  // user record는 callback에서 생성/갱신해 client의 displayName/email/photoURL을
  // signInWithCustomToken 직후 그대로 사용할 수 있게 한다.
  try {
    if (userExists) {
      await getAdminAuth().updateUser(targetUid, {
        email: kakaoProfile.email ?? undefined,
        displayName: kakaoProfile.nickname ?? undefined,
        photoURL: kakaoProfile.profileImageUrl ?? undefined,
      });
    } else {
      await getAdminAuth().createUser({
        uid: targetUid,
        email: kakaoProfile.email ?? undefined,
        displayName: kakaoProfile.nickname ?? undefined,
        photoURL: kakaoProfile.profileImageUrl ?? undefined,
      });
    }
  } catch (error) {
    console.error("[kakao callback] create/update user failed:", error);
    return errorRedirect(
      origin,
      "user_record_failed",
      "사용자 정보 동기화에 실패했습니다.",
    );
  }

  const needsTransfer = !userExists;
  const confirmRequired = userExists;

  const ticket = await createTicket({
    anonUid: attempt.anonUid,
    targetUid,
    provider: "kakao",
    needsTransfer,
    confirmRequired,
  });

  const url = buildHandoverRedirect(origin, { ticket: ticket.ticketId });
  return Response.redirect(url, 302);
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
  });
  return Response.redirect(url, 302);
}
