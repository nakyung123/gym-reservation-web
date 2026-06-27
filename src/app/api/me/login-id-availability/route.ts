import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { findUserIdByLoginId } from "@/lib/server/db-user-profile-repository";
import { validateLoginId } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

// 아이디(loginId) 사용 가능 여부 조회. 가입 폼에서도 호출하므로 unauthenticated 허용.
// 인증 헤더가 있고 유효하면 본인 loginId는 사용 가능으로 처리(설정 화면 노이즈 방지).
// 인증 헤더가 있는데 검증 실패면 익명처럼 조용히 대체하지 않고 401로 응답한다.
// 응답: { available: true } | { available: false, reason: "taken" | "invalid" }
// 최종 보호는 DB unique constraint + setLoginIdOnce의 P2002 처리에 있다.
// 형식 규칙은 validateLoginId(SSOT)와 동일하다.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("loginId") ?? "";
  const validation = validateLoginId(raw);
  if (!validation.ok) {
    return Response.json({ available: false, reason: "invalid" });
  }
  const loginId = validation.value;

  let selfUid: string | null = null;
  if (request.headers.get("authorization")) {
    const auth = await verifyIdTokenFromRequest(request);
    if (!auth.ok) {
      return Response.json({ message: auth.message }, { status: auth.status });
    }
    selfUid = auth.uid;
  }

  try {
    const ownerUid = await findUserIdByLoginId(loginId);
    if (!ownerUid || (selfUid && ownerUid === selfUid)) {
      return Response.json({ available: true });
    }
    return Response.json({ available: false, reason: "taken" });
  } catch (error) {
    return serverErrorResponse(
      "아이디 사용 가능 여부를 확인하지 못했습니다.",
      "Failed to check login id availability",
      error,
    );
  }
}
