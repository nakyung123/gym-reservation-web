import { afterEach, describe, expect, it, vi } from "vitest";

const {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  getFirebaseClient,
} = vi.hoisted(() => ({
  GoogleAuthProvider: vi.fn(),
  linkWithPopup: vi.fn(),
  signInWithPopup: vi.fn(),
  getFirebaseClient: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

import {
  linkGoogleAccount,
  signInWithGoogle,
} from "@/lib/firebase-google-auth";

function mockAnonymousUser() {
  getFirebaseClient.mockReturnValue({
    auth: { currentUser: { isAnonymous: true } },
  });
}

function mockRealUser() {
  getFirebaseClient.mockReturnValue({
    auth: { currentUser: { isAnonymous: false } },
  });
}

function mockNoUser() {
  getFirebaseClient.mockReturnValue({
    auth: { currentUser: null },
  });
}

function mockAuthForSignIn() {
  getFirebaseClient.mockReturnValue({
    auth: {},
  });
}

function makeFirebaseError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

describe("linkGoogleAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("익명 사용자일 때 linkWithPopup을 호출하고 ok:true를 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockResolvedValue({ user: {} });

    const result = await linkGoogleAccount();

    expect(result).toEqual({ ok: true });
    expect(linkWithPopup).toHaveBeenCalledTimes(1);
  });

  it("currentUser가 없을 때 linkWithPopup을 시도하지 않고 오류를 반환한다", async () => {
    mockNoUser();

    const result = await linkGoogleAccount();

    expect(result).toMatchObject({
      ok: false,
      cancelled: false,
      reason: "other",
    });
    expect(linkWithPopup).not.toHaveBeenCalled();
  });

  it("이미 정식 계정일 때 링크를 시도하지 않고 오류를 반환한다", async () => {
    mockRealUser();

    const result = await linkGoogleAccount();

    expect(result).toMatchObject({
      ok: false,
      cancelled: false,
      reason: "other",
    });
    expect(linkWithPopup).not.toHaveBeenCalled();
  });

  it("popup-closed-by-user 오류는 cancelled:true를 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockRejectedValue(
      makeFirebaseError("auth/popup-closed-by-user"),
    );

    const result = await linkGoogleAccount();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("cancelled-popup-request 오류는 cancelled:true를 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockRejectedValue(
      makeFirebaseError("auth/cancelled-popup-request"),
    );

    const result = await linkGoogleAccount();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("credential-already-in-use 오류는 reason:credential-already-in-use를 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockRejectedValue(
      makeFirebaseError("auth/credential-already-in-use"),
    );

    const result = await linkGoogleAccount();

    expect(result).toMatchObject({
      ok: false,
      cancelled: false,
      reason: "credential-already-in-use",
    });
    expect(
      (result as Extract<typeof result, { cancelled: false }>).message,
    ).toContain("기존 계정으로 로그인할 수 있습니다");
  });

  it("provider-already-linked 오류는 사용자 메시지를 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockRejectedValue(
      makeFirebaseError("auth/provider-already-linked"),
    );

    const result = await linkGoogleAccount();

    expect(result).toMatchObject({
      ok: false,
      cancelled: false,
      reason: "other",
    });
    expect(
      (result as Extract<typeof result, { cancelled: false }>).message,
    ).toBeTruthy();
  });

  it("알 수 없는 오류는 Error.message를 그대로 반환한다", async () => {
    mockAnonymousUser();
    linkWithPopup.mockRejectedValue(
      makeFirebaseError("auth/unknown", "something went wrong"),
    );

    const result = await linkGoogleAccount();

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      reason: "other",
      message: "something went wrong",
    });
  });
});

describe("signInWithGoogle", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("성공 시 ok:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockResolvedValue({ user: {} });

    const result = await signInWithGoogle();

    expect(result).toEqual({ ok: true });
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("popup-closed-by-user 오류는 cancelled:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/popup-closed-by-user"),
    );

    const result = await signInWithGoogle();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("cancelled-popup-request 오류는 cancelled:true를 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/cancelled-popup-request"),
    );

    const result = await signInWithGoogle();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it("알 수 없는 오류는 Error.message를 그대로 반환한다", async () => {
    mockAuthForSignIn();
    signInWithPopup.mockRejectedValue(
      makeFirebaseError("auth/unknown", "boom"),
    );

    const result = await signInWithGoogle();

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "boom",
    });
  });
});
