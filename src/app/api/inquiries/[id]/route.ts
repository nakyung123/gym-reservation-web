import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { getUserInquiryById } from "@/lib/server/db-inquiry-repository";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;

  let inquiry: Awaited<ReturnType<typeof getUserInquiryById>>;
  try {
    // userId 스코프 조회. 남의 문의/없는 문의는 모두 null → 404로 존재 여부를 숨긴다(IDOR 차단).
    inquiry = await getUserInquiryById(auth.uid, id);
  } catch (error) {
    return serverErrorResponse(
      "문의를 불러오지 못했습니다.",
      "Failed to fetch user inquiry detail",
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
