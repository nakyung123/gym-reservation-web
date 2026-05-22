import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fileToResizedDataUrl,
  updateProfilePhoto,
} from "@/lib/profile-photo-client";
import type { UserProfile } from "@/lib/user-profile";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

const profile: UserProfile = {
  userId: "photo-client-user",
  nickname: "나경",
  provider: "local",
  photoBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  preferredRegion: "서울 강서구",
  preferredSports: [],
  reservationNotificationsEnabled: true,
  createdAt: "2026-05-14T03:00:00.000Z",
  updatedAt: "2026-05-14T03:00:00.000Z",
};

function mockCurrentUser(token = "id-token") {
  getFirebaseClient.mockReturnValue({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(token),
      },
    },
  });
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("profile-photo-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("지원하지 않는 파일 형식은 이미지 로드 전에 거부한다", async () => {
    const file = { type: "image/gif", size: 1 } as File;

    await expect(fileToResizedDataUrl(file)).resolves.toEqual({
      ok: false,
      message: "JPG 또는 PNG 형식의 이미지만 사용할 수 있습니다.",
    });
  });

  it("2MB를 넘는 파일은 이미지 로드 전에 거부한다", async () => {
    const file = { type: "image/png", size: 2 * 1024 * 1024 + 1 } as File;

    await expect(fileToResizedDataUrl(file)).resolves.toEqual({
      ok: false,
      message: "이미지 용량은 2MB 이하만 사용할 수 있습니다.",
    });
  });

  it("로그인 사용자가 없으면 API를 호출하지 않고 auth-required를 반환한다", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProfilePhoto(null)).resolves.toEqual({
      ok: false,
      kind: "auth-required",
      message: "로그인 후 다시 시도해 주세요.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ID 토큰 획득 실패는 Firebase 원문을 노출하지 않는다", async () => {
    getFirebaseClient.mockReturnValue({
      auth: {
        currentUser: {
          getIdToken: vi.fn().mockRejectedValue(new Error("raw token detail")),
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateProfilePhoto(null);

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw token detail");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("프로필 사진 변경 요청에 토큰과 본문을 함께 보낸다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({
        user: { uid: profile.userId },
        profile,
        message: "프로필 사진이 변경되었습니다.",
      }),
    );

    await expect(updateProfilePhoto(profile.photoBase64)).resolves.toEqual({
      ok: true,
      user: { uid: profile.userId },
      profile,
      message: "프로필 사진이 변경되었습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/me/profile-photo", {
      method: "PUT",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ photoBase64: profile.photoBase64 }),
      signal: undefined,
    });
  });

  it("프로필 사진 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await updateProfilePhoto(profile.photoBase64);

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "프로필 사진 변경 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("인증 실패 응답은 서버 message를 보존하고 auth-required로 매핑한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "ID 토큰 검증에 실패했습니다." },
        { status: 401 },
      ),
    );

    await expect(updateProfilePhoto(null)).resolves.toEqual({
      ok: false,
      kind: "auth-required",
      message: "ID 토큰 검증에 실패했습니다.",
      status: 401,
    });
  });

  it("서버 오류 응답은 안전한 서버 message를 보존한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "프로필 사진을 변경하지 못했습니다." },
        { status: 500 },
      ),
    );

    await expect(updateProfilePhoto(profile.photoBase64)).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "프로필 사진을 변경하지 못했습니다.",
      status: 500,
    });
  });

  it("성공 status여도 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        user: { uid: "other-user" },
        profile,
        message: "프로필 사진이 변경되었습니다.",
      }),
    );

    await expect(updateProfilePhoto(profile.photoBase64)).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "프로필 사진 변경 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });
});
