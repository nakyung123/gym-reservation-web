import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import { getUserProfile } from "@/lib/server/db-user-profile-repository";
import { verifyPasswordResetOobCode } from "@/lib/server/firebase-password-verify";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// 비밀번호 재설정 oobCode로 본인(이메일 소유)을 "서버에서" 검증한 뒤 그 계정의 가입 아이디(loginId)를
// 돌려준다. 이메일을 직접 받지 않는다 — 과거 설계(이메일 파라미터)는 임의 이메일로 타인의 loginId를
// 조회할 수 있는 미인증 노출/열거였다. 클라의 verifyPasswordResetCode 검증만으로는 서버가 신뢰할 수
// 없으므로(엔드포인트 직접 호출로 우회 가능), 서버가 oobCode를 직접 재검증한다.
// 경로명에 by-email이 남아 있는 것은 과거 호환을 위한 것이며, 실제 입력은 oobCode다.
// 응답: { loginId: string | null }  (코드 무효/계정 없음/아이디 미설정이면 null = fail-closed)
export async function POST(request: NextRequest) {
  // 무인증 + Admin 조회 경로라 enumeration/비용 방어용 per-IP rate limit (login-id 라우트와 동일 패턴).
  let ipLimit;
  try {
    ipLimit = await checkRateLimit({
      scope: "login-id-by-email:ip",
      identifier: extractClientIp(request.headers),
      limit: 20,
      windowMs: 5 * 60_000,
    });
  } catch (error) {
    return serverErrorResponse(
      "아이디를 조회하지 못했습니다.",
      "[login-id-by-email] rate limit check failed",
      error,
    );
  }
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  let body: { oobCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ loginId: null });
  }
  const oobCode = typeof body.oobCode === "string" ? body.oobCode.trim() : "";
  if (!oobCode) {
    return Response.json({ loginId: null });
  }

  // 서버가 oobCode를 직접 검증 → 검증된 이메일을 얻는다(클라가 보낸 이메일을 신뢰하지 않음).
  const verified = await verifyPasswordResetOobCode(oobCode);
  if (!verified.ok) {
    // 무효/만료 코드·설정/네트워크 오류 → 아무 정보도 노출하지 않고 null (fail-closed).
    return Response.json({ loginId: null });
  }

  try {
    const user = await getAdminAuth().getUserByEmail(verified.email);
    const profile = await getUserProfile(user.uid);
    return Response.json({ loginId: profile?.loginId ?? null });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/user-not-found" || code === "auth/invalid-email") {
      return Response.json({ loginId: null });
    }
    return serverErrorResponse(
      "아이디를 조회하지 못했습니다.",
      "Failed to look up login id by reset code",
      error,
    );
  }
}
