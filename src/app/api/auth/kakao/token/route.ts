import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import {
  findActiveTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";

export const dynamic = "force-dynamic";

// handover 페이지가 ticket을 customToken으로 교환한다. customToken은 절대 URL에
// 노출되지 않고, POST response body로만 전달된다.
// ticket.confirmRequired=true(기존 가입)인 경우 confirmed:true 플래그가 필요하다.

export async function POST(request: NextRequest) {
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

  const ticket = await findActiveTicket(ticketId);
  if (!ticket) {
    return Response.json(
      { message: "유효하지 않거나 만료된 ticket입니다." },
      { status: 401 },
    );
  }
  if (ticket.provider !== "kakao") {
    return Response.json(
      { message: "provider가 일치하지 않습니다." },
      { status: 400 },
    );
  }

  if (ticket.confirmRequired && !confirmed) {
    return Response.json(
      {
        message: "이미 가입된 카카오 계정입니다. 명시 확인이 필요합니다.",
        confirmRequired: true,
      },
      { status: 409 },
    );
  }

  // pending 또는 이미 token_issued면 idempotent 재발급 허용. 그 외는 거부.
  if (ticket.status !== "pending" && ticket.status !== "token_issued") {
    return Response.json(
      { message: "ticket 상태가 token 발급 가능 단계가 아닙니다." },
      { status: 409 },
    );
  }

  let customToken: string;
  try {
    customToken = await getAdminAuth().createCustomToken(ticket.targetUid, {
      provider: ticket.provider,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[kakao token] createCustomToken failed:", detail);
    return Response.json(
      { message: "Custom Token 발급에 실패했습니다." },
      { status: 500 },
    );
  }

  await markTokenIssued(ticketId);

  return Response.json({
    customToken,
    needsTransfer: ticket.needsTransfer,
  });
}
