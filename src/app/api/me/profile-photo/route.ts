import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { resolveAuthProvider } from "@/lib/server/auth-provider";
import { updateUserProfilePhoto } from "@/lib/server/mysql-user-profile-repository";
import { validateProfilePhotoInput } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

// PUT /api/me/profile-photo
// 프로필 사진(data URL)을 갱신하거나 null로 비운다. 사진은 닉네임/지역 등과 별도 흐름이라
// 업로드/삭제 즉시 반영을 위해 분리된 endpoint를 둔다.
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

  const validation = validateProfilePhotoInput(body);
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const provider = resolveAuthProvider(auth);

  try {
    const profile = await updateUserProfilePhoto(
      auth.uid,
      validation.input.photoBase64,
      provider,
    );
    return Response.json({
      user: { uid: auth.uid },
      profile,
      message:
        validation.input.photoBase64 === null
          ? "프로필 사진이 기본 이미지로 변경되었습니다."
          : "프로필 사진이 변경되었습니다.",
    });
  } catch (error) {
    return serverErrorResponse(
      "프로필 사진을 변경하지 못했습니다.",
      "Failed to update profile photo",
      error,
    );
  }
}
