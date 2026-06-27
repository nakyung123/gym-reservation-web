import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { setLoginIdOnce } from "@/lib/server/db-user-profile-repository";
import { validateLoginId } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

// POST: 아이디(loginId)를 1회 설정한다. 가입 마지막 단계에서 호출한다.
// 이미 설정돼 있으면 409(불변), 다른 회원이 선점했으면 409(taken),
// 프로필이 없으면 409(먼저 프로필 생성 필요). 형식 오류는 400.
// 프로필은 ensureUserProfile(POST /api/me/profile)로 먼저 생성돼 있어야 한다.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: { loginId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateLoginId(body.loginId);
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof setLoginIdOnce>>;
  try {
    result = await setLoginIdOnce(auth.uid, validation.value);
  } catch (error) {
    return serverErrorResponse(
      "아이디를 설정하지 못했습니다.",
      "Failed to set login id",
      error,
    );
  }

  if (result.ok) {
    return Response.json({ loginId: result.loginId });
  }

  // 실패 사유를 명시적으로 응답한다(No Silent Fallback).
  switch (result.reason) {
    case "already-set":
      return Response.json(
        { message: "이미 아이디가 설정되어 변경할 수 없습니다." },
        { status: 409 },
      );
    case "taken":
      return Response.json(
        { message: "이미 사용 중인 아이디입니다." },
        { status: 409 },
      );
    case "no-profile":
      return Response.json(
        { message: "프로필이 아직 생성되지 않았습니다. 다시 시도해 주세요." },
        { status: 409 },
      );
  }
}
