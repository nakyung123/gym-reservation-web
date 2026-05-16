import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  migrateAnonymousToTarget,
  MigrationConflictError,
} from "@/lib/server/account-migration";
import {
  findActiveTicket,
  markSignedIn,
  markTransferred,
  recordFinalizeFailure,
  MAX_FINALIZE_ATTEMPTS,
} from "@/lib/server/oauth/handover-ticket";

export const dynamic = "force-dynamic";

// 클라이언트가 signInWithCustomToken 후 새 targetUid ID token으로 호출한다.
// 데이터 이전(needsTransfer=true)이 필요하면 트랜잭션으로 실행, 실패 시 ticket
// 상태는 signed_in으로 유지해 같은 ticket으로 재시도 가능하게 한다.

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

  const ticket = await findActiveTicket(ticketId);
  if (!ticket) {
    return Response.json(
      { message: "유효하지 않거나 만료된 ticket입니다." },
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
    return Response.json({ ok: true });
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

  // token_issued → signed_in (idempotent). pending 상태가 아니므로 정상 진행.
  await markSignedIn(ticketId);

  if (ticket.needsTransfer) {
    try {
      await migrateAnonymousToTarget({
        anonUid: ticket.anonUid,
        targetUid: ticket.targetUid,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "알 수 없는 마이그레이션 오류";
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
        {
          message: "계정 데이터 이전에 실패했습니다.",
          retryable: true,
        },
        { status: 500 },
      );
    }
  }

  await markTransferred(ticketId);

  return Response.json({ ok: true });
}
