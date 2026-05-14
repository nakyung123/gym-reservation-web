import type { NextRequest } from "next/server";
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

  const profile = await getUserProfile(auth.uid);
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

  const profile = await upsertUserProfile(auth.uid, validation.input);
  return Response.json({
    user: { uid: auth.uid },
    profile,
    message: "프로필 설정이 저장되었습니다.",
  });
}
