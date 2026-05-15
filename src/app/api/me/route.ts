import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { getUserSummary } from "@/lib/server/mysql-user-summary-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let summary: Awaited<ReturnType<typeof getUserSummary>>;
  try {
    summary = await getUserSummary(auth.uid);
  } catch (error) {
    return serverErrorResponse(
      "내 정보 요약을 불러오지 못했습니다.",
      "Failed to fetch user summary",
      error,
    );
  }

  return Response.json({
    user: { uid: auth.uid },
    summary,
  });
}
