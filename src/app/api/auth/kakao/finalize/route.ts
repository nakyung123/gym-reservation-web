import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  migrateAnonymousToTarget,
  MigrationConflictError,
} from "@/lib/server/account-migration";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import { prisma } from "@/lib/server/prisma-client";
import {
  findActiveTicket,
  markSignedIn,
  markTransferred,
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
// 신규/기존 판정은 여기서 한다: targetUid에 앱 데이터가 하나라도 존재하면
// 기존 가입으로 간주하고 confirmed=true가 없으면 409 conflict를 응답한다.
// 신규 가입이면 migrateAnonymousToTarget을 호출해 데이터 이전.
// 그 뒤 admin.updateUser로 provider profile snapshot을 반영하되,
// 실패해도 본 흐름은 성공으로 처리하고 profileSynced:false만 알린다.

export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: { ticketId?: unknown; confirmed?: unknown };
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
  const confirmed = body.confirmed === true;

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
  if (ticket.status === "transferred") {
    return Response.json({ ok: true, transferred: false, profileSynced: true });
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

  // token_issued → signed_in (idempotent). retry 시 이미 signed_in이면 그대로.
  await markSignedIn(ticketId);

  // targetUid에 기존 앱 데이터가 있는지 검사. 하나라도 있으면 기존 계정으로 본다.
  const hasExistingData = await targetHasAppData(ticket.targetUid);

  if (hasExistingData) {
    if (!confirmed) {
      // 사용자에게 확인을 받아야 한다. attempt count는 올리지 않는다(흐름상 정상).
      return Response.json(
        {
          message: "이미 가입된 카카오 계정입니다. 확인이 필요합니다.",
          conflict: "existing_account",
        },
        { status: 409 },
      );
    }
    // confirmed=true: 기존 계정으로 그대로 로그인. anon 데이터는 이전하지 않는다.
    const profileSynced = await syncProfile(
      ticket.targetUid,
      ticket.profilePayload,
    );
    await markTransferred(ticketId);
    return Response.json({ ok: true, transferred: false, profileSynced });
  }

  // 신규 가입: anon → target 데이터 이전.
  try {
    await migrateAnonymousToTarget({
      anonUid: ticket.anonUid,
      targetUid: ticket.targetUid,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 마이그레이션 오류";
    await recordFinalizeFailure(ticketId, message);
    if (error instanceof MigrationConflictError) {
      return Response.json(
        {
          message:
            "계정 데이터 이전 중 충돌이 발생했습니다. 다시 시도해 주세요.",
          retryable: true,
        },
        { status: 409 },
      );
    }
    console.error("[kakao finalize] migration failed:", error);
    return Response.json(
      { message: "계정 데이터 이전에 실패했습니다.", retryable: true },
      { status: 500 },
    );
  }

  const profileSynced = await syncProfile(
    ticket.targetUid,
    ticket.profilePayload,
  );
  await markTransferred(ticketId);
  return Response.json({ ok: true, transferred: true, profileSynced });
}

// targetUid에 UserProfile/Favorite/Reservation 중 하나라도 존재하면 true.
async function targetHasAppData(targetUid: string): Promise<boolean> {
  const [profile, favoriteCount, reservationCount] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId: targetUid },
      select: { userId: true },
    }),
    prisma.favorite.count({ where: { userId: targetUid } }),
    prisma.reservation.count({ where: { userId: targetUid } }),
  ]);
  return Boolean(profile) || favoriteCount > 0 || reservationCount > 0;
}

// provider profile snapshot을 Firebase user record에 반영한다.
// 실패해도 본 흐름은 성공으로 처리하고 false만 반환한다.
async function syncProfile(
  targetUid: string,
  payload: HandoverProfilePayload | null,
): Promise<boolean> {
  if (!payload) return true;
  const update: { email?: string; displayName?: string; photoURL?: string } =
    {};
  if (payload.email) update.email = payload.email;
  if (payload.nickname) update.displayName = payload.nickname;
  if (payload.photoUrl) update.photoURL = payload.photoUrl;
  if (Object.keys(update).length === 0) return true;
  try {
    await getAdminAuth().updateUser(targetUid, update);
    return true;
  } catch (error) {
    console.error("[kakao finalize] updateUser failed:", error);
    return false;
  }
}
