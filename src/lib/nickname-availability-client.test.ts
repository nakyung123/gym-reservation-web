import { afterEach, describe, expect, it, vi } from "vitest";
import { checkNicknameAvailability } from "@/lib/nickname-availability-client";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

function mockCurrentUser(token = "id-token") {
  getFirebaseClient.mockReturnValue({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(token),
      },
    },
  });
}

function mockSignedOut() {
  getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("checkNicknameAvailability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("빈 닉네임은 API 호출 없이 invalid로 처리한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkNicknameAvailability("   ")).resolves.toEqual({
      ok: true,
      available: false,
      reason: "invalid",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("로그인하지 않은 상태에서도 닉네임 사용 가능 여부를 조회한다", async () => {
    mockSignedOut();
    const fetchMock = mockFetch(Response.json({ available: true }));

    await expect(checkNicknameAvailability(" 새닉네임 ")).resolves.toEqual({
      ok: true,
      available: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/nickname-availability?nickname=%EC%83%88%EB%8B%89%EB%84%A4%EC%9E%84",
      {
        headers: undefined,
        signal: undefined,
      },
    );
  });

  it("로그인 상태면 ID 토큰을 포함해 본인 닉네임 조회를 요청한다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({ available: false, reason: "taken" }),
    );

    await expect(checkNicknameAvailability("중복닉")).resolves.toEqual({
      ok: true,
      available: false,
      reason: "taken",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/nickname-availability?nickname=%EC%A4%91%EB%B3%B5%EB%8B%89",
      {
        headers: { Authorization: "Bearer id-token" },
        signal: undefined,
      },
    );
  });

  it("서버 오류 응답의 안전한 메시지를 유지한다", async () => {
    mockSignedOut();
    mockFetch(
      Response.json(
        { message: "닉네임 사용 가능 여부를 확인하지 못했습니다." },
        { status: 500 },
      ),
    );

    await expect(checkNicknameAvailability("새닉네임")).resolves.toEqual({
      ok: false,
      message: "닉네임 사용 가능 여부를 확인하지 못했습니다.",
    });
  });

  it("잘못된 성공 응답 형식을 거부한다", async () => {
    mockSignedOut();
    mockFetch(Response.json({ available: "yes" }));

    await expect(checkNicknameAvailability("새닉네임")).resolves.toEqual({
      ok: false,
      message: "닉네임 조회 응답이 올바르지 않습니다.",
    });
  });
});
