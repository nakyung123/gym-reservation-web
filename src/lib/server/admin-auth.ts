import "server-only";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/server/firebase-admin";

// 관리자 API 인증 정책: Authorization: Bearer <Firebase ID token>을 검증하고,
// decoded token의 custom claim admin === true 인 경우만 허용한다.
// 공유 시크릿(x-admin-token, ADMIN_API_TOKEN)은 폐기됐다.
//
// /admin 페이지의 Basic Auth(=ADMIN_PAGE_USER/PASSWORD)는 별개 계층이며
// 페이지 1차 잠금 용도다. API 권한은 이 모듈이 책임진다.

type AdminAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403; message: string };

export async function verifyAdminTokenFromRequest(
  request: NextRequest,
): Promise<AdminAuthResult> {
  const header =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    };
  }

  const idToken = header.slice("bearer ".length).trim();
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      message: "관리자 인증이 필요합니다.",
    };
  }

  let decoded: Awaited<ReturnType<ReturnType<typeof getAdminAuth>["verifyIdToken"]>>;
  try {
    // 관리자 권한은 회수 즉시 차단되어야 하므로 revoked token 검사까지 수행한다.
    decoded = await getAdminAuth().verifyIdToken(idToken, true);
  } catch {
    return {
      ok: false,
      status: 401,
      message: "관리자 인증에 실패했습니다.",
    };
  }

  // custom claim admin === true(불리언) 만 인정한다. 문자열 "true"나
  // truthy 값은 받아들이지 않는다. 운영 콘솔/스크립트에서 setCustomUserClaims로
  // { admin: true } 를 부여한 사용자만 통과한다.
  if (decoded.admin !== true) {
    return {
      ok: false,
      status: 403,
      message: "관리자 권한이 없습니다.",
    };
  }

  return { ok: true, uid: decoded.uid };
}
