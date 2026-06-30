import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// 이메일 사용 가능 여부 조회. 가입 폼에서 호출하므로 unauthenticated 허용.
// 이메일 계정의 SSOT는 Firebase Auth이므로 Admin getUserByEmail로 존재 여부를 확인한다.
// 응답: { available: true } | { available: false, reason: "taken" | "invalid" }
// 최종 보호는 가입 시 signupWithEmail의 auth/email-already-in-use 처리에 있다.
// 무인증 + 매 호출 Admin getUserByEmail 왕복이라 enumeration/비용 방어용 per-IP rate limit를 건다
// (이메일 중복확인은 버튼 액션이라 30/분이면 정상 사용을 막지 않는다).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  let ipLimit;
  try {
    ipLimit = await checkRateLimit({
      scope: "email-availability:ip",
      identifier: extractClientIp(request.headers),
      limit: 30,
      windowMs: 60_000,
    });
  } catch (error) {
    return serverErrorResponse(
      "이메일 사용 가능 여부를 확인하지 못했습니다.",
      "[email-availability] rate limit check failed",
      error,
    );
  }
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const raw = (request.nextUrl.searchParams.get("email") ?? "").trim();
  if (!raw || raw.length > 254 || !EMAIL_PATTERN.test(raw)) {
    return Response.json({ available: false, reason: "invalid" });
  }

  try {
    await getAdminAuth().getUserByEmail(raw);
    // 조회 성공 = 이미 가입된 이메일.
    return Response.json({ available: false, reason: "taken" });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/user-not-found") {
      return Response.json({ available: true });
    }
    if (code === "auth/invalid-email") {
      return Response.json({ available: false, reason: "invalid" });
    }
    return serverErrorResponse(
      "이메일 사용 가능 여부를 확인하지 못했습니다.",
      "Failed to check email availability",
      error,
    );
  }
}
