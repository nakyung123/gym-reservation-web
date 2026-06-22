import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { resolveAuthProvider } from "@/lib/server/auth-provider";
import {
  ensureUserProfile,
  getUserProfile,
  upsertUserProfile,
} from "@/lib/server/db-user-profile-repository";
import { validateUserProfileInput } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

// GET: 프로필 조회 (없으면 null). 조회는 mutation 없이 read-only.
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

// POST: 프로필 보장(없으면 기본값으로 생성, 있으면 provider 동기화).
// 첫 로그인 직후 client가 명시 호출. provider는 클라이언트 입력이 아니라
// 서버가 ID token sign_in_provider와 uid prefix로 산출한다.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const provider = resolveAuthProvider(auth);

  let profile: Awaited<ReturnType<typeof ensureUserProfile>>;
  try {
    profile = await ensureUserProfile(auth.uid, provider);
  } catch (error) {
    return serverErrorResponse(
      "프로필을 초기화하지 못했습니다.",
      "Failed to ensure user profile",
      error,
    );
  }

  return Response.json({
    user: { uid: auth.uid },
    profile,
  });
}

// PUT: 프로필 갱신. provider는 본문으로 받지 않고 서버가 다시 산출해서 함께 저장한다.
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

  const provider = resolveAuthProvider(auth);

  let profile: Awaited<ReturnType<typeof upsertUserProfile>>;
  try {
    // 회원정보(name/phone/birthDate/address)만 갱신한다. 닉네임은 PUT에서
    // 건드리지 않으므로 nickname unique 충돌 경로는 발생하지 않는다.
    profile = await upsertUserProfile(auth.uid, validation.input, provider);
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
