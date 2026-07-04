import type { NextRequest } from "next/server";
import { createVocPost } from "@/lib/server/db-voc-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { validateVocInput } from "@/lib/voc";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// 공개 문의 게시판 글 작성. 로그인 없이 익명으로 작성하며, 임시 비밀번호는 서버에서 해시 저장한다.
// 응답에는 성명(마스킹) 등 공개 정보만 담고 연락처/이메일/비밀번호는 반환하지 않는다.
export async function POST(request: NextRequest) {
  // 무인증 공개 작성 경로라 per-IP rate limit으로 스팸/대량 등록을 막는다(fail-closed).
  try {
    const ipLimit = await checkRateLimit({
      scope: "voc-create:ip",
      identifier: extractClientIp(request.headers),
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);
  } catch (error) {
    return serverErrorResponse(
      "문의 등록에 실패했습니다.",
      "[voc-create] rate limit check failed",
      error,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const validation = validateVocInput({
    category: raw.category,
    gymId: raw.gymId,
    authorName: raw.authorName,
    phone: raw.phone,
    email: raw.email,
    body: raw.body,
    password: raw.password,
  });
  if (!validation.ok) {
    return Response.json(
      { ok: false, message: validation.message },
      { status: 400 },
    );
  }

  // 체육관을 지정했으면 실재하는 시설인지 확인한다(없는 시설 참조 차단).
  if (validation.input.gymId !== null) {
    let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
    try {
      gym = await gymRepository.findById(validation.input.gymId);
    } catch (error) {
      return serverErrorResponse(
        "시설 정보를 확인하지 못했습니다.",
        "Failed to verify gym for voc post",
        error,
      );
    }
    if (!gym) {
      return Response.json(
        { ok: false, message: "존재하지 않는 시설입니다." },
        { status: 400 },
      );
    }
  }

  // 인증은 선택이다: Authorization 헤더가 있고 유효하면 uid를 글에 연결하고(마이페이지 노출),
  // 없거나 무효하면 익명(null)으로 작성한다. 공개 게시판이라 로그인은 강제하지 않는다.
  const auth = await verifyIdTokenFromRequest(request);
  const userId = auth.ok ? auth.uid : null;

  try {
    // reused=true(짧은 창 내 재전송)면 기존 글을 그대로 돌려준다(중복 생성 없음). 응답 형태는 동일.
    const { post } = await createVocPost(validation.input, userId);
    return Response.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(
      "문의 등록에 실패했습니다.",
      "Failed to create voc post",
      error,
    );
  }
}
