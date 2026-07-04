import type { NextRequest } from "next/server";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { answerInquiryInDb } from "@/lib/server/db-inquiry-repository";
import { validateInquiryAnswer } from "@/lib/inquiry";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

type PatchBody = { answer?: unknown };

export async function PATCH(request: NextRequest, ctx: Context) {
  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json(
      { ok: false, message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateInquiryAnswer(body.answer);
  if (!validation.ok) {
    return Response.json(
      { ok: false, message: validation.message },
      { status: 400 },
    );
  }

  let inquiry: Awaited<ReturnType<typeof answerInquiryInDb>>;
  try {
    // answer + status=answered + answeredAt=now 단일 update. 재저장은 최신 answer로 덮어쓰기(멱등).
    inquiry = await answerInquiryInDb(id, validation.answer);
  } catch (error) {
    return serverErrorResponse(
      "답변 저장에 실패했습니다.",
      "Failed to answer inquiry",
      error,
    );
  }
  if (!inquiry) {
    return Response.json(
      { ok: false, message: "문의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, inquiry });
}
