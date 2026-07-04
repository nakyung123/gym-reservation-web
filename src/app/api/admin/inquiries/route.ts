import type { NextRequest } from "next/server";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { listAdminInquiries } from "@/lib/server/db-inquiry-repository";
import { isInquiryStatus } from "@/lib/domain-constants";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  // status=open|answered|all(생략=전체). all/미지정이면 필터 없음.
  const statusParam = request.nextUrl.searchParams.get("status");
  if (
    statusParam !== null &&
    statusParam !== "all" &&
    !isInquiryStatus(statusParam)
  ) {
    return Response.json(
      { ok: false, message: "status는 open, answered, all 중 하나여야 합니다." },
      { status: 400 },
    );
  }
  const status =
    statusParam && statusParam !== "all" && isInquiryStatus(statusParam)
      ? statusParam
      : undefined;

  const pageParam = request.nextUrl.searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;

  let result: Awaited<ReturnType<typeof listAdminInquiries>>;
  try {
    result = await listAdminInquiries({
      status,
      page: Number.isFinite(page) ? page : 1,
    });
  } catch (error) {
    return serverErrorResponse(
      "문의 목록을 불러오지 못했습니다.",
      "Failed to list admin inquiries",
      error,
    );
  }
  return Response.json({
    ok: true,
    inquiries: result.inquiries,
    total: result.total,
  });
}
