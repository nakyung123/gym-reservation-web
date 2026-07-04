import type { NextRequest } from "next/server";
import { verifyVocPost } from "@/lib/server/db-voc-repository";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 공개 문의 게시판 글 본문 조회: 글별 임시 비밀번호 검증에 성공해야 본문을 반환한다.
// 비밀번호는 매 요청 서버에서만 해시 비교하고, 실패 사유(없음/틀림)를 명시한다.
//
// 비밀번호가 숫자 4자리(1만 조합)로 약하므로 rate limit을 이중으로 건다:
//   - per-IP: 한 출처의 무차별 대입 차단.
//   - per-post: 여러 IP로 분산해도 특정 글 하나에 대한 시도 총량을 캡(약한 secret 방어의 핵심).
// 두 검사 모두 실패 시 fail-closed(429/500). 정상 작성자는 자기 비밀번호를 알아 영향 없다.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const ipLimit = await checkRateLimit({
      scope: "voc-verify:ip",
      identifier: extractClientIp(request.headers),
      limit: 30,
      windowMs: 10 * 60_000,
    });
    if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

    const postLimit = await checkRateLimit({
      scope: "voc-verify:post",
      identifier: id,
      limit: 12,
      windowMs: 10 * 60_000,
    });
    if (!postLimit.ok) return rateLimitedJsonResponse(postLimit);
  } catch (error) {
    return serverErrorResponse(
      "문의를 불러오지 못했습니다.",
      "[voc-verify] rate limit check failed",
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

  const password = (body as { password?: unknown })?.password;
  if (typeof password !== "string" || password.length === 0) {
    return Response.json(
      { ok: false, message: "비밀번호를 입력해 주세요." },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof verifyVocPost>>;
  try {
    result = await verifyVocPost(id, password);
  } catch (error) {
    return serverErrorResponse(
      "문의를 불러오지 못했습니다.",
      "Failed to verify voc post",
      error,
    );
  }

  if (result.ok) {
    return Response.json({ ok: true, post: result.post });
  }
  if (result.reason === "not-found") {
    return Response.json(
      { ok: false, message: "문의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return Response.json(
    { ok: false, message: "비밀번호가 일치하지 않습니다." },
    { status: 401 },
  );
}
