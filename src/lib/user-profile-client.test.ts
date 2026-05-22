import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchUserProfile,
  saveUserProfile,
} from "@/lib/user-profile-client";
import type { UserProfile } from "@/lib/user-profile";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

const profile: UserProfile = {
  userId: "profile-client-user",
  nickname: "나경",
  provider: "local",
  photoBase64: null,
  preferredRegion: "서울 강서구",
  preferredSports: ["배드민턴"],
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

describe("user-profile-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("로그인 사용자가 없으면 API를 호출하지 않고 auth-required를 반환한다", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUserProfile()).resolves.toMatchObject({
      ok: false,
      kind: "auth-required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ID 토큰을 가져오지 못하면 API를 호출하지 않고 error를 반환한다", async () => {
    getFirebaseClient.mockReturnValue({
      auth: {
        currentUser: {
          getIdToken: vi.fn().mockRejectedValue(new Error("token unavailable")),
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUserProfile()).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "ID 토큰을 가져오지 못했습니다. token unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("프로필이 없는 유효 응답을 반환한다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({ user: { uid: profile.userId }, profile: null }),
    );

    await expect(fetchUserProfile()).resolves.toEqual({
      ok: true,
      user: { uid: profile.userId },
      profile: null,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/me/profile", {
      headers: { Authorization: "Bearer id-token" },
      signal: undefined,
    });
  });

  it("프로필 설정을 저장하고 입력을 정리해 요청한다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({
        user: { uid: profile.userId },
        profile,
        message: "프로필 설정이 저장되었습니다.",
      }),
    );

    await expect(
      saveUserProfile({
        nickname: "  나경  ",
        preferredRegion: " 서울 강서구 ",
        preferredSports: ["배드민턴", "배드민턴"],
        reservationNotificationsEnabled: true,
      }),
    ).resolves.toEqual({
      ok: true,
      user: { uid: profile.userId },
      profile,
      message: "프로필 설정이 저장되었습니다.",
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      nickname: "나경",
      preferredRegion: "서울 강서구",
      preferredSports: ["배드민턴"],
      reservationNotificationsEnabled: true,
    });
  });

  it("401 응답은 auth-required로 매핑한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "ID 토큰 검증에 실패했습니다." },
        { status: 401 },
      ),
    );

    await expect(fetchUserProfile()).resolves.toEqual({
      ok: false,
      kind: "auth-required",
      message: "ID 토큰 검증에 실패했습니다.",
      status: 401,
    });
  });

  it("응답 사용자와 프로필 사용자가 다르면 형식 오류로 처리한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        user: { uid: "different-user" },
        profile,
      }),
    );

    await expect(fetchUserProfile()).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "프로필 설정 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("성공 status여도 저장 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        user: { uid: profile.userId },
        profile: { ...profile, userId: "different-user" },
        message: "프로필 설정이 저장되었습니다.",
      }),
    );

    await expect(
      saveUserProfile({
        nickname: "나경",
        preferredRegion: "서울 강서구",
        preferredSports: ["배드민턴"],
        reservationNotificationsEnabled: true,
      }),
    ).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "프로필 설정 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("저장 입력이 올바르지 않으면 API를 호출하지 않는다", async () => {
    mockCurrentUser();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveUserProfile({
        nickname: null,
        preferredRegion: null,
        preferredSports: ["축구" as never],
        reservationNotificationsEnabled: true,
      }),
    ).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "지원하지 않는 선호 종목입니다: 축구",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abort 에러는 호출자가 무시할 수 있도록 다시 던진다", async () => {
    mockCurrentUser();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchUserProfile()).rejects.toBe(abortError);
  });
});
