import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import {
  findActiveTicket,
  markTokenIssued,
} from "@/lib/server/oauth/handover-ticket";
import {
  OAUTH_HANDOVER_COOKIE,
  safeEqualToken,
} from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// handover 페이지가 ticket을 customToken으로 교환한다. customToken은 절대 URL에
// 노출되지 않고 POST response body로만 전달된다.
// 보안: body ticketId + HttpOnly handover cookie의 nonce가 ticket의
// handoverNonce와 모두 일치할 때만 발급한다. nonce가 없거나 불일치면 401.
// 신규/기존 판정은 이 단계에서 하지 않는다 (finalize transaction이 결정).

export async function POST(request: NextRequest) {
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
  if (ticket.provider !== "kakao") {
    return Response.json(
      { message: "provider가 일치하지 않습니다." },
      { status: 400 },
    );
  }

  // pending 또는 token_issued이면 idempotent 재발급 허용. 그 외는 거부.
  // signed_in/transferred에서는 token 재발급 대신 클라이언트가 finalize만
  // 재호출하도록 한다(retry helper 분리).
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

  try {
    await markTokenIssued(ticketId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[kakao token] markTokenIssued failed:", detail);
    return Response.json(
      { message: "Custom Token 발급에 실패했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ customToken });
}
