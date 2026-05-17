import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma-client";

export const dynamic = "force-dynamic";

// 닉네임 사용 가능 여부 조회. 가입 폼에서도 호출하므로 unauthenticated 허용.
// 인증 헤더가 있고 유효하면 본인 nickname은 사용 가능으로 처리(편집 시 노이즈 방지).
// 응답: { available: true } | { available: false, reason: "taken" | "invalid" }
// 최종 보호는 DB unique constraint + upsert P2002 처리에 있다.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("nickname") ?? "";
  const nickname = raw.trim();
  if (nickname.length === 0 || nickname.length > 30) {
    return Response.json({ available: false, reason: "invalid" });
  }

  let selfUid: string | null = null;
  if (request.headers.get("authorization")) {
    const auth = await verifyIdTokenFromRequest(request);
    if (auth.ok) selfUid = auth.uid;
  }

  try {
    const found = await prisma.userProfile.findUnique({
      where: { nickname },
      select: { userId: true },
    });
    if (!found || (selfUid && found.userId === selfUid)) {
      return Response.json({ available: true });
    }
    return Response.json({ available: false, reason: "taken" });
  } catch (error) {
    return serverErrorResponse(
      "닉네임 사용 가능 여부를 확인하지 못했습니다.",
      "Failed to check nickname availability",
      error,
    );
  }
}
