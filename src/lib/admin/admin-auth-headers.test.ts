import { onAuthStateChanged } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { getFirebaseClient } from "@/lib/firebase-client";

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

type MockUser = {
  getIdToken: ReturnType<typeof vi.fn>;
};

function createMockUser(token = "admin-id-token"): MockUser {
  return {
    getIdToken: vi.fn().mockResolvedValue(token),
  };
}

function setFirebaseAuthCurrentUser(currentUser: unknown): void {
  vi.mocked(getFirebaseClient).mockReturnValue({
    app: {},
    auth: { currentUser },
  } as unknown as ReturnType<typeof getFirebaseClient>);
}

function mockAuthStateChanged(
  impl: (
    onUser: (user: unknown) => void,
    onError?: () => void,
  ) => () => void,
): void {
  vi.mocked(onAuthStateChanged).mockImplementation(
    ((_auth, onUser, onError) =>
      impl(
        onUser as (user: unknown) => void,
        onError as (() => void) | undefined,
      )) as typeof onAuthStateChanged,
  );
}

describe("getAdminAuthHeader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("currentUser가 이미 있으면 즉시 ID token을 Authorization 헤더로 만든다", async () => {
    const user = createMockUser("token-a");
    setFirebaseAuthCurrentUser(user);

    await expect(getAdminAuthHeader()).resolves.toEqual({
      ok: true,
      headers: { Authorization: "Bearer token-a" },
    });
    expect(user.getIdToken).toHaveBeenCalledOnce();
    expect(onAuthStateChanged).not.toHaveBeenCalled();
  });

  it("currentUser가 아직 없으면 auth 상태 복원 콜백을 한 번 기다린다", async () => {
    const user = createMockUser("restored-token");
    const unsubscribe = vi.fn();
    setFirebaseAuthCurrentUser(null);
    mockAuthStateChanged((onUser) => {
      onUser(user);
      return unsubscribe;
    });

    await expect(getAdminAuthHeader()).resolves.toEqual({
      ok: true,
      headers: { Authorization: "Bearer restored-token" },
    });
    expect(user.getIdToken).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("auth 복원 이후에도 user가 없으면 로그인 필요 결과를 반환한다", async () => {
    const unsubscribe = vi.fn();
    setFirebaseAuthCurrentUser(null);
    mockAuthStateChanged((onUser) => {
      onUser(null);
      return unsubscribe;
    });

    await expect(getAdminAuthHeader()).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("auth 복원이 끝나지 않으면 짧게 기다린 뒤 로그인 필요 결과를 반환한다", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    setFirebaseAuthCurrentUser(null);
    mockAuthStateChanged(() => unsubscribe);

    const result = getAdminAuthHeader();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(result).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("ID token 조회가 실패하면 재로그인 안내를 반환한다", async () => {
    const user = createMockUser();
    user.getIdToken.mockRejectedValue(new Error("token unavailable"));
    setFirebaseAuthCurrentUser(user);

    await expect(getAdminAuthHeader()).resolves.toEqual({
      ok: false,
      message: "관리자 인증 토큰을 가져오지 못했습니다. 다시 로그인해 주세요.",
    });
  });
});
