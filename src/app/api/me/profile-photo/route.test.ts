import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/me/profile-photo/route";
import { ensureUserProfile } from "@/lib/server/db-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";

const { verifyIdToken } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
}));

function requestFor(
  body: unknown,
  { idToken = "test-id-token" }: { idToken?: string } = {},
) {
  return new NextRequest("http://localhost:3000/api/me/profile-photo", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestRawBody(rawBody: string) {
  return new NextRequest("http://localhost:3000/api/me/profile-photo", {
    method: "PUT",
    headers: {
      Authorization: "Bearer test-id-token",
      "Content-Type": "application/json",
    },
    body: rawBody,
  });
}

// 실제 1×1 PNG base64. validateProfilePhotoInput의 매직 바이트 + padding 검증을 통과한다.
const SAMPLE_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("PUT /api/me/profile-photo", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("Authorization 헤더가 없으면 401을 반환하고 DB를 건드리지 않는다", async () => {
    const response = await PUT(
      new NextRequest("http://localhost:3000/api/me/profile-photo", {
        method: "PUT",
        body: JSON.stringify({ photoBase64: SAMPLE_PHOTO }),
      }),
    );
    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("JSON 본문 파싱 실패는 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "photo-route-user",
      firebase: { sign_in_provider: "password" },
    });

    const response = await PUT(requestRawBody("not-json"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: unknown };
    expect(body.message).toBe("요청 본문이 JSON 형식이 아닙니다.");
  });

  it("photoBase64가 잘못된 형식이면 400을 반환한다", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "photo-route-user",
      firebase: { sign_in_provider: "password" },
    });

    const response = await PUT(
      requestFor({ photoBase64: "iVBORw-no-prefix" }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: unknown };
    expect(body.message).toEqual(
      expect.stringContaining("JPEG 또는 PNG data URL 형식"),
    );
  });

  it("정상 요청은 사진을 저장하고 갱신된 프로필을 반환한다", async () => {
    const userId = "photo-route-success-user";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });

    const response = await PUT(requestFor({ photoBase64: SAMPLE_PHOTO }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user?: { uid?: unknown };
      profile?: { photoBase64?: unknown; provider?: unknown };
      message?: unknown;
    };
    expect(body.user).toEqual({ uid: userId });
    expect(body.profile).toMatchObject({
      photoBase64: SAMPLE_PHOTO,
      provider: "local",
    });
    expect(body.message).toBe("프로필 사진이 변경되었습니다.");

    const stored = await prisma.userProfile.findUnique({ where: { userId } });
    expect(stored?.photoBase64).toBe(SAMPLE_PHOTO);
  });

  it("photoBase64가 null이면 기본 이미지로 비우고 안내 메시지를 바꾼다", async () => {
    const userId = "photo-route-clear-user";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });
    await ensureUserProfile(userId, "local");
    await prisma.userProfile.update({
      where: { userId },
      data: { photoBase64: SAMPLE_PHOTO },
    });

    const response = await PUT(requestFor({ photoBase64: null }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      profile?: { photoBase64?: unknown };
      message?: unknown;
    };
    expect(body.profile).toMatchObject({ photoBase64: null });
    expect(body.message).toBe("프로필 사진이 기본 이미지로 변경되었습니다.");
  });

  it("Kakao uid는 provider를 kakao로 산출해 저장한다", async () => {
    const userId = "kakao:photo-route-user";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "custom" },
    });

    const response = await PUT(requestFor({ photoBase64: SAMPLE_PHOTO }));
    expect(response.status).toBe(200);
    const stored = await prisma.userProfile.findUnique({ where: { userId } });
    expect(stored?.provider).toBe("kakao");
    expect(stored?.photoBase64).toBe(SAMPLE_PHOTO);
  });

  it("repository 실패는 500을 반환한다", async () => {
    const userId = "photo-route-error-user";
    verifyIdToken.mockResolvedValue({
      uid: userId,
      firebase: { sign_in_provider: "password" },
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const findSpy = vi
      .spyOn(prisma.userProfile, "findUnique")
      .mockRejectedValueOnce(new Error("db down"));

    try {
      const response = await PUT(requestFor({ photoBase64: SAMPLE_PHOTO }));
      expect(response.status).toBe(500);
      const body = (await response.json()) as { message?: unknown };
      expect(body.message).toBe("프로필 사진을 변경하지 못했습니다.");
    } finally {
      findSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
