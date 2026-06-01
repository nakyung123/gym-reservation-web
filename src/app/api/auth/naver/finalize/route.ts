import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import {
  findActiveTicket,
  markSignedIn,
  markFinalized,
  recordFinalizeFailure,
  MAX_FINALIZE_ATTEMPTS,
  type HandoverProfilePayload,
} from "@/lib/server/oauth/handover-ticket";
import {
  OAUTH_HANDOVER_COOKIE,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const FINALIZE_FAILURE_MESSAGE = "로그인 마감 처리에 실패했습니다.";

// 네이버 handover finalize. 카카오 finalize와 동형.
// 익명 흐름 제거 후 migration이 사라져 profile sync만 수행.

export async function POST(request: NextRequest) {
  // IP 기반만 추가. ticket 기반 제한은 기존 handover_tickets.finalize_attempt_count(MAX 5)에서
  // 이미 강제하므로 중복 구현 안 함.
  const ipLimit = await checkRateLimit({
    scope: "oauth-finalize:ip",
    identifier: extractClientIp(request.headers),
    limit: 30,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: { ticketId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { message: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
  if (!ticketId) {
    return Response.json(
      { message: "ticketId가 누락됐습니다." },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(OAUTH_HANDOVER_COOKIE);
  if (!nonceCookie) {
    return Response.json(
      { message: "handover nonce 쿠키가 없습니다." },
      { status: 401 },
    );
  }

  const ticket = await findActiveTicket(ticketId);
  if (!ticket) {
    return Response.json(
      { message: "유효하지 않거나 만료된 ticket입니다." },
      { status: 401 },
    );
  }
  if (!safeEqualToken(nonceCookie.value, ticket.handoverNonce)) {
    return Response.json(
      { message: "handover nonce가 일치하지 않습니다." },
      { status: 401 },
    );
  }
  if (ticket.targetUid !== auth.uid) {
    return Response.json(
      { message: "ticket과 인증된 사용자가 일치하지 않습니다." },
      { status: 401 },
    );
  }
  if (ticket.provider !== "naver") {
    return Response.json(
      { message: "provider가 일치하지 않습니다." },
      { status: 400 },
    );
  }
  if (ticket.status === "pending") {
    return Response.json(
      { message: "Custom Token 발급이 먼저 필요합니다." },
      { status: 409 },
    );
  }
  if (ticket.status === "finalized") {
    return Response.json({ ok: true, profileSynced: true });
  }
  if (ticket.finalizeAttemptCount >= MAX_FINALIZE_ATTEMPTS) {
    return Response.json(
      {
        message: "재시도 횟수를 초과했습니다. 처음부터 다시 시도해 주세요.",
        retryable: false,
      },
      { status: 429 },
    );
  }

  try {
    const signedIn = await markSignedIn(ticketId);
    if (!signedIn) {
      throw new Error("markSignedIn returned null");
    }
  } catch {
    console.error("[naver finalize] sign-in state transition failed");
    return Response.json(
      { message: FINALIZE_FAILURE_MESSAGE, retryable: true },
      { status: 500 },
    );
  }

  let profileSynced = true;
  try {
    profileSynced = await syncProfile(ticket.targetUid, ticket.profilePayload);
  } catch {
    await recordFailureSafely(ticketId, "[naver finalize]");
    console.error("[naver finalize] sync failed");
    return Response.json(
      { message: FINALIZE_FAILURE_MESSAGE, retryable: true },
      { status: 500 },
    );
  }

  try {
    const finalized = await markFinalized(ticketId);
    if (!finalized) {
      throw new Error("markFinalized returned null");
    }
  } catch {
    await recordFailureSafely(ticketId, "[naver finalize]");
    console.error("[naver finalize] finalize state transition failed");
    return Response.json(
      { message: FINALIZE_FAILURE_MESSAGE, retryable: true },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, profileSynced });
}

async function recordFailureSafely(
  ticketId: string,
  logPrefix: string,
): Promise<void> {
  try {
    // 외부 서비스/SDK 오류 message에는 계정 식별자나 내부 사유가 섞일 수 있으므로
    // DB에는 고정된 실패 분류만 남긴다. 사용자 응답도 FINALIZE_FAILURE_MESSAGE로 통일한다.
    await recordFinalizeFailure(ticketId, "finalize_failed");
  } catch {
    console.error(`${logPrefix} record failure failed`);
  }
}

// 네이버에서 받은 displayName/photoURL은 동기화하지 않는다 (nickname은 서버 자동 생성,
// 프로필 사진은 별도 업로드 기능을 사용한다). email만 일치 시 user record에 반영한다.
async function syncProfile(
  targetUid: string,
  payload: HandoverProfilePayload | null,
): Promise<boolean> {
  if (!payload || !payload.email) return true;
  await getAdminAuth().updateUser(targetUid, { email: payload.email });
  return true;
}
