import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUserSummary } from "@/lib/user-summary-client";
import type { UserSummary } from "@/lib/user-summary";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

const summary: UserSummary = {
  userId: "summary-client-user",
  reservations: {
    total: 3,
    reserved: 1,
    cancelled: 1,
    used: 1,
  },
  favorites: {
    activeGymCount: 2,
  },
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

describe("fetchUserSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("로그인 사용자가 없으면 API를 호출하지 않고 auth-required를 반환한다", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUserSummary()).resolves.toMatchObject({
      ok: false,
      kind: "auth-required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("유효한 응답이면 내 정보 요약을 반환한다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({ user: { uid: summary.userId }, summary }),
    );

    await expect(fetchUserSummary()).resolves.toEqual({
      ok: true,
      user: { uid: summary.userId },
      summary,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/me", {
      headers: { Authorization: "Bearer id-token" },
      signal: undefined,
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

    await expect(fetchUserSummary()).resolves.toEqual({
      ok: false,
      kind: "auth-required",
      message: "ID 토큰 검증에 실패했습니다.",
      status: 401,
    });
  });

  it("응답 사용자와 요약 사용자가 다르면 형식 오류로 처리한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        user: { uid: "different-user" },
        summary,
      }),
    );

    await expect(fetchUserSummary()).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "내 정보 조회 실패: status=200",
      status: 200,
    });
  });

  it("잘못된 요약 응답 형식을 거부한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        user: { uid: summary.userId },
        summary: {
          ...summary,
          reservations: { ...summary.reservations, total: "3" },
        },
      }),
    );

    await expect(fetchUserSummary()).resolves.toMatchObject({
      ok: false,
      kind: "error",
      status: 200,
    });
  });

  it("abort 에러는 호출자가 무시할 수 있도록 다시 던진다", async () => {
    mockCurrentUser();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchUserSummary()).rejects.toBe(abortError);
  });
});
