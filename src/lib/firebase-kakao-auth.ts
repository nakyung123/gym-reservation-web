import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { setOAuthInProgress } from "@/lib/firebase-auth-session";

// 카카오 OAuth 흐름의 클라이언트 측 helper.
// 첫 시도: /start → window.location → /callback → /auth/handover →
//          /token → signInWithCustomToken → /finalize.
// 재시도/확인 후 진행: /token 재호출 없이 현재 user의 ID token으로 /finalize만.
// customToken은 절대 URL/스토리지에 남기지 않고 POST response body로만 받는다.

export type StartKakaoLoginResult =
  | { ok: true }
  | { ok: false; message: string };

export type FinalizeKakaoResult =
  | { ok: true; transferred: boolean; profileSynced: boolean }
  | { ok: false; reason: "confirm-required"; ticketId: string }
  | {
      ok: false;
      reason: "conflict";
      message: string;
      ticketId: string;
    }
  | { ok: false; reason: "other"; message: string };

export async function startKakaoLogin(): Promise<StartKakaoLoginResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      message:
        "로그인 세션이 없습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
    };
  }
  if (!user.isAnonymous) {
    return {
      ok: false,
      message: "이미 정식 계정으로 로그인되어 있습니다.",
    };
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (error) {
    return {
      ok: false,
      message: `로그인 토큰을 가져오지 못했습니다. ${describeError(error)}`,
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/auth/kakao/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (error) {
    return {
      ok: false,
      message: `카카오 로그인 시작에 실패했습니다. ${describeError(error)}`,
    };
  }
  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `카카오 로그인 시작에 실패했습니다. status=${response.status}`,
    );
    return { ok: false, message };
  }
  const data = (await response.json().catch(() => null)) as
    | { authorizeUrl?: string }
    | null;
  if (!data?.authorizeUrl) {
    return {
      ok: false,
      message: "authorize URL을 받지 못했습니다.",
    };
  }

  window.location.href = data.authorizeUrl;
  return { ok: true };
}

// 첫 finalize: ticket → customToken → signInWithCustomToken → /finalize.
// /token은 ticket + handover cookie 둘 다 검증한다.
export async function finalizeKakaoHandover(input: {
  ticketId: string;
}): Promise<FinalizeKakaoResult> {
  // signInWithCustomToken은 내부 sign-out → sign-in 순서로 동작해 잠깐 user=null이 된다.
  // 그 사이 firebase-auth-session이 익명 sign-in으로 currentUser를 덮어쓰지 않도록 차단.
  setOAuthInProgress(true);
  try {
    const tokenResult = await exchangeTicketForCustomToken(input.ticketId);
    if (!tokenResult.ok) {
      return tokenResult;
    }

    const { auth } = getFirebaseClient();
    try {
      await signInWithCustomToken(auth, tokenResult.customToken);
    } catch (error) {
      return {
        ok: false,
        reason: "other",
        message: `Firebase 로그인에 실패했습니다. ${describeError(error)}`,
      };
    }

    return await callFinalize({ ticketId: input.ticketId, confirmed: false });
  } finally {
    setOAuthInProgress(false);
  }
}

// 확인 흐름 또는 migration 충돌 retry. signInWithCustomToken은 이미 완료된 상태.
export async function retryKakaoFinalize(input: {
  ticketId: string;
  confirmed: boolean;
}): Promise<FinalizeKakaoResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return {
      ok: false,
      reason: "other",
      message:
        "로그인 세션이 만료됐습니다. 카카오 연결을 처음부터 다시 시도해 주세요.",
    };
  }
  setOAuthInProgress(true);
  try {
    return await callFinalize(input);
  } finally {
    setOAuthInProgress(false);
  }
}

async function callFinalize(input: {
  ticketId: string;
  confirmed: boolean;
}): Promise<FinalizeKakaoResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "other",
      message: "로그인 세션이 만료됐습니다.",
    };
  }
  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `ID 토큰을 가져오지 못했습니다. ${describeError(error)}`,
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/auth/kakao/finalize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticketId: input.ticketId,
        confirmed: input.confirmed,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `데이터 이전 요청 실패: ${describeError(error)}`,
    };
  }

  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as
      | { conflict?: string; retryable?: boolean; message?: string }
      | null;
    if (body?.conflict === "existing_account") {
      return {
        ok: false,
        reason: "confirm-required",
        ticketId: input.ticketId,
      };
    }
    if (body?.retryable) {
      return {
        ok: false,
        reason: "conflict",
        message: body.message ?? "계정 데이터 이전 충돌이 발생했습니다.",
        ticketId: input.ticketId,
      };
    }
    return {
      ok: false,
      reason: "other",
      message: body?.message ?? "충돌이 발생했습니다.",
    };
  }
  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `데이터 이전 실패. status=${response.status}`,
    );
    return { ok: false, reason: "other", message };
  }

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; transferred?: boolean; profileSynced?: boolean }
    | null;

  // server admin.updateUser가 ID token을 invalidate해 reload가
  // auth/user-token-expired로 떨어진다. forced refresh로 새 token을 받은 뒤 reload.
  try {
    await user.getIdToken(true);
    await user.reload();
  } catch (error) {
    console.warn("[kakao finalize] currentUser refresh failed:", error);
  }

  return {
    ok: true,
    transferred: data?.transferred === true,
    profileSynced: data?.profileSynced !== false,
  };
}

type TokenExchangeResult =
  | { ok: true; customToken: string }
  | { ok: false; reason: "other"; message: string };

async function exchangeTicketForCustomToken(
  ticketId: string,
): Promise<TokenExchangeResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/kakao/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `토큰 교환 요청 실패: ${describeError(error)}`,
    };
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `토큰 교환 실패. status=${response.status}`,
    );
    return { ok: false, reason: "other", message };
  }

  const data = (await response.json().catch(() => null)) as
    | { customToken?: string }
    | null;
  if (!data?.customToken) {
    return {
      ok: false,
      reason: "other",
      message: "토큰 교환 응답이 올바르지 않습니다.",
    };
  }
  return { ok: true, customToken: data.customToken };
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "알 수 없는 오류";
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;
  return body?.message ?? fallback;
}
