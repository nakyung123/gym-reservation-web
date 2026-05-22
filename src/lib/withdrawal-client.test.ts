import { afterEach, describe, expect, it, vi } from "vitest";
import { withdrawAccount } from "@/lib/withdrawal-client";
import type { WithdrawalInput } from "@/lib/withdrawal";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

const input: WithdrawalInput = {
  category: "기타",
  detail: null,
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

describe("withdrawal-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("로그인 사용자가 없으면 API를 호출하지 않고 auth-required를 반환한다", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "auth-required",
      message: "로그인 후 다시 시도해 주세요.",
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

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "error",
      message: "ID 토큰을 가져오지 못했습니다. token unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("탈퇴 요청에 토큰과 본문을 함께 보낸다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json({ message: "회원 탈퇴가 완료되었습니다." }),
    );

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: true,
      message: "회원 탈퇴가 완료되었습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/me/withdraw", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  });

  it("진행 중 예약 응답은 active-reservation reason과 서버 message를 보존한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        {
          reason: "active-reservation",
          message:
            "취소되지 않은 예약이 있어 탈퇴할 수 없습니다. 내 예약에서 모두 취소한 뒤 다시 시도해 주세요.",
        },
        { status: 409 },
      ),
    );

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "active-reservation",
      message:
        "취소되지 않은 예약이 있어 탈퇴할 수 없습니다. 내 예약에서 모두 취소한 뒤 다시 시도해 주세요.",
      status: 409,
    });
  });

  it("Auth 삭제 실패 응답은 auth-delete-failed reason과 서버 message를 보존한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        {
          reason: "auth-delete-failed",
          message:
            "회원 정보는 삭제되었지만 인증 계정 정리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 502 },
      ),
    );

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "auth-delete-failed",
      message:
        "회원 정보는 삭제되었지만 인증 계정 정리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      status: 502,
    });
  });

  it("인증 실패 응답은 서버 message를 보존하고 auth-required로 매핑한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "ID 토큰 검증에 실패했습니다." },
        { status: 401 },
      ),
    );

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "auth-required",
      message: "ID 토큰 검증에 실패했습니다.",
      status: 401,
    });
  });

  it("서버 오류 응답은 안전한 서버 message를 보존한다", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "회원 정보 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      ),
    );

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "error",
      message: "회원 정보 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      status: 500,
    });
  });

  it("응답 JSON을 읽지 못하면 성공으로 보지 않는다", async () => {
    mockCurrentUser();
    mockFetch(new Response("not-json", { status: 200 }));

    await expect(withdrawAccount(input)).resolves.toEqual({
      ok: false,
      reason: "error",
      message: "회원 탈퇴 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });
});
