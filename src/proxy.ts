import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminPageBasicAuth } from "@/lib/server/admin-page-auth";
import {
  checkRateLimit,
  extractClientIp,
} from "@/lib/server/rate-limit";

// Next.js 16: middleware는 deprecated되어 proxy로 renamed됨.
// 문서: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
//
// 이 proxy는 관리자 페이지(/admin, /admin/...)에 1차 잠금을 건다.
// - /api/admin/* Route Handler는 별도 ADMIN_API_TOKEN(x-admin-token 헤더)로 보호되며,
//   본 matcher에서 의도적으로 제외한다.
// - 인증 자격은 ADMIN_PAGE_USER / ADMIN_PAGE_PASSWORD env로만 받는다.
//   NEXT_PUBLIC_ 접두어를 절대 붙이지 않는다.

const BASIC_REALM = 'Basic realm="Admin", charset="UTF-8"';

export async function proxy(request: NextRequest) {
  // IP 기반 rate limit. Basic Auth brute force 방어 + 동시에 잘못된 자격 시도 폭주 차단.
  // admin 페이지는 트래픽이 매우 적어 DB 1쿼리 추가 비용은 무시할 만하다.
  // (admin API는 별도 `admin-api:ip` scope로 따로 카운트된다 — cross-scope HMAC 격리됨)
  const ipLimit = await checkRateLimit({
    scope: "admin-page:ip",
    identifier: extractClientIp(request.headers),
    limit: 30,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) {
    return new NextResponse(
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      {
        status: 429,
        headers: {
          "Retry-After": String(ipLimit.retryAfterSeconds),
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const authHeader = request.headers.get("authorization");
  const result = verifyAdminPageBasicAuth(authHeader);

  if (result.ok) {
    return NextResponse.next();
  }

  if (result.status === 503) {
    // 운영자에게는 fail-closed임을 알리되 비밀값/내부 사유는 노출하지 않는다.
    return new NextResponse(
      "관리자 페이지를 일시적으로 사용할 수 없습니다.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return new NextResponse("관리자 인증이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": BASIC_REALM,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  // /admin 자체와 /admin/* 하위 페이지만 매치. /api/admin/*는 포함하지 않는다.
  matcher: ["/admin", "/admin/:path*"],
};
