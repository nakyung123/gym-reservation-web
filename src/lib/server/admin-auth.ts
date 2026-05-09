import "server-only";
import type { NextRequest } from "next/server";

type AdminAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; message: string };

export function verifyAdminTokenFromRequest(
  request: NextRequest,
): AdminAuthResult {
  const expectedToken = process.env.ADMIN_API_TOKEN?.trim();
  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      message: "관리자 API 토큰이 설정되어 있지 않습니다.",
    };
  }

  const actualToken = request.headers.get("x-admin-token")?.trim();
  if (!actualToken) {
    return {
      ok: false,
      status: 401,
      message: "관리자 API 토큰이 필요합니다.",
    };
  }

  if (actualToken !== expectedToken) {
    return {
      ok: false,
      status: 403,
      message: "관리자 API 토큰이 올바르지 않습니다.",
    };
  }

  return { ok: true };
}
