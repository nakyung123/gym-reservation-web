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

// 네이버 handover finalize. 카카오 finalize와 동형.
// 신규/기존 판정은 targetUid에 앱 데이터가 있는지로 결정한다.

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
  if (ticket.status === "transferred") {
    return Response.json({
      ok: true,
      transferred: ticket.outcome === "migrated",
      profileSynced: true,
    });
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

  const hasExistingData = await targetHasAppData(ticket.targetUid);

  if (hasExistingData) {
    if (!confirmed) {
      return Response.json(
        {
          message: "이미 가입된 네이버 계정입니다. 확인이 필요합니다.",
          conflict: "existing_account",
        },
        { status: 409 },
      );
    }
    const profileSynced = await syncProfile(
      ticket.targetUid,
      ticket.profilePayload,
    );
    await markTransferred(ticketId, "linked");
    return Response.json({ ok: true, transferred: false, profileSynced });
  }

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
    console.error("[naver finalize] migration failed:", error);
    return Response.json(
      { message: "계정 데이터 이전에 실패했습니다.", retryable: true },
      { status: 500 },
    );
  }

  const profileSynced = await syncProfile(
    ticket.targetUid,
    ticket.profilePayload,
  );
  await markTransferred(ticketId, "migrated");
  return Response.json({ ok: true, transferred: true, profileSynced });
}

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
    console.error("[naver finalize] updateUser failed:", error);
    return false;
  }
}
