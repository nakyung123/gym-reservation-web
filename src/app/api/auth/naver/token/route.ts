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
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// 네이버 handover 단계의 customToken 교환. 카카오 /token과 동형.
// 보안: body ticketId + HttpOnly handover cookie의 nonce가 ticket의
// handoverNonce와 모두 일치할 때만 발급.

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit({
    scope: "oauth-token:ip",
    identifier: extractClientIp(request.headers),
    limit: 30,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

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

  // ticketId 기반 제한: 같은 ticket을 5분 안에 10회까지만 customToken 교환 허용.
  // ticket TTL과 동일 윈도우. ticketId 자체는 helper가 HMAC 해시한다.
  const ticketLimit = await checkRateLimit({
    scope: "oauth-token:ticket",
    identifier: `naver:${ticketId}`,
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (!ticketLimit.ok) return rateLimitedJsonResponse(ticketLimit);

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
  if (ticket.provider !== "naver") {
    return Response.json(
      { message: "provider가 일치하지 않습니다." },
      { status: 400 },
    );
  }

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
  } catch {
    console.error("[naver token] createCustomToken failed");
    return Response.json(
      { message: "Custom Token 발급에 실패했습니다." },
      { status: 500 },
    );
  }

  try {
    await markTokenIssued(ticketId);
  } catch {
    console.error("[naver token] markTokenIssued failed");
    return Response.json(
      { message: "Custom Token 발급에 실패했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ customToken });
}
