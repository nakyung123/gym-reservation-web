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

export const dynamic = "force-dynamic";

// 클라이언트가 signInWithCustomToken 후 새 targetUid ID token으로 호출한다.
// 익명 흐름 제거로 migration이 사라져 finalize는 profile sync(admin.updateUser)와
// ticket을 finalized로 마감하는 단순 동작만 수행한다.

export async function POST(request: NextRequest) {
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
  if (ticket.provider !== "kakao") {
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

  await markSignedIn(ticketId);

  let profileSynced = true;
  try {
    profileSynced = await syncProfile(ticket.targetUid, ticket.profilePayload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 finalize 오류";
    await recordFinalizeFailure(ticketId, message);
    console.error("[kakao finalize] sync failed:", error);
    return Response.json(
      { message: "로그인 마감 처리에 실패했습니다.", retryable: true },
      { status: 500 },
    );
  }

  await markFinalized(ticketId);
  return Response.json({ ok: true, profileSynced });
}

// 카카오에서 받은 displayName/photoURL은 동기화하지 않는다 (nickname은 서버 자동 생성,
// 프로필 사진은 별도 업로드 기능을 사용한다). email만 일치 시 user record에 반영한다.
async function syncProfile(
  targetUid: string,
  payload: HandoverProfilePayload | null,
): Promise<boolean> {
  if (!payload || !payload.email) return true;
  try {
    await getAdminAuth().updateUser(targetUid, { email: payload.email });
    return true;
  } catch (error) {
    console.error("[kakao finalize] updateUser failed:", error);
    return false;
  }
}
