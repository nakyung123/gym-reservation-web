import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { listUserVocPosts } from "@/lib/server/db-voc-repository";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

// 마이페이지 문의 내역: 로그인 사용자가 작성한 공개 게시판 글 목록을 반환한다(본문 제외).
// 인증 필수. 응답에는 마스킹된 성명·분류·시설·등록일 등 공개 정보만 담는다.
export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const pageParam = request.nextUrl.searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;

  try {
    const result = await listUserVocPosts(auth.uid, {
      page: Number.isFinite(page) ? page : 1,
    });
    return Response.json({
      ok: true,
      posts: result.posts,
      total: result.total,
    });
  } catch (error) {
    return serverErrorResponse(
      "문의 내역을 불러오지 못했습니다.",
      "Failed to list user voc posts",
      error,
    );
  }
}
