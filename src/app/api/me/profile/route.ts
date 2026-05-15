import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  getUserProfile,
  upsertUserProfile,
} from "@/lib/server/mysql-user-profile-repository";
import { validateUserProfileInput } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let profile: Awaited<ReturnType<typeof getUserProfile>>;
  try {
    profile = await getUserProfile(auth.uid);
  } catch (error) {
    return serverErrorResponse(
      "프로필 설정을 불러오지 못했습니다.",
      "Failed to fetch user profile",
      error,
    );
  }

  return Response.json({
    user: { uid: auth.uid },
    profile,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateUserProfileInput(body);
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  let profile: Awaited<ReturnType<typeof upsertUserProfile>>;
  try {
    profile = await upsertUserProfile(auth.uid, validation.input);
  } catch (error) {
    return serverErrorResponse(
      "프로필 설정을 저장하지 못했습니다.",
      "Failed to save user profile",
      error,
    );
  }

  return Response.json({
    user: { uid: auth.uid },
    profile,
    message: "프로필 설정이 저장되었습니다.",
  });
}
