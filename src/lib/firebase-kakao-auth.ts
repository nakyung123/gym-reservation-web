import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 카카오 OAuth 흐름의 클라이언트 측 helper.
// /start → window.location → /callback → /auth/handover → /token → signInWithCustomToken → /finalize.
// customToken은 절대 URL/스토리지에 남기지 않고 POST response body로만 받는다.

export type StartKakaoLoginResult =
  | { ok: true }
  | { ok: false; message: string };

export type FinalizeKakaoResult =
  | { ok: true; transferred: boolean }
  | {
      ok: false;
      reason: "confirm-required";
      ticketId: string;
    }
  | {
      ok: false;
      reason: "conflict";
      message: string;
      ticketId: string;
    }
  | {
      ok: false;
      reason: "other";
      message: string;
    };

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

export async function finalizeKakaoHandover(input: {
  ticketId: string;
  confirmed?: boolean;
}): Promise<FinalizeKakaoResult> {
  const tokenResult = await exchangeTicketForCustomToken(input);
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

  const newUser = auth.currentUser;
  if (!newUser) {
    return {
      ok: false,
      reason: "other",
      message: "로그인 후 사용자를 확인하지 못했습니다.",
    };
  }
  let newIdToken: string;
  try {
    newIdToken = await newUser.getIdToken();
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `새 ID 토큰을 가져오지 못했습니다. ${describeError(error)}`,
    };
  }

  let finalizeResponse: Response;
  try {
    finalizeResponse = await fetch("/api/auth/kakao/finalize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newIdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticketId: input.ticketId }),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `데이터 이전 요청 실패: ${describeError(error)}`,
    };
  }

  if (finalizeResponse.status === 409) {
    const message = await readErrorMessage(
      finalizeResponse,
      "계정 데이터 이전 충돌이 발생했습니다.",
    );
    return {
      ok: false,
      reason: "conflict",
      message,
      ticketId: input.ticketId,
    };
  }
  if (!finalizeResponse.ok) {
    const message = await readErrorMessage(
      finalizeResponse,
      `데이터 이전 실패. status=${finalizeResponse.status}`,
    );
    return { ok: false, reason: "other", message };
  }

  return { ok: true, transferred: tokenResult.needsTransfer };
}

type TokenExchangeResult =
  | { ok: true; customToken: string; needsTransfer: boolean }
  | { ok: false; reason: "confirm-required"; ticketId: string }
  | { ok: false; reason: "other"; message: string };

async function exchangeTicketForCustomToken(input: {
  ticketId: string;
  confirmed?: boolean;
}): Promise<TokenExchangeResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/kakao/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: input.ticketId,
        confirmed: input.confirmed === true,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "other",
      message: `토큰 교환 요청 실패: ${describeError(error)}`,
    };
  }

  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as
      | { confirmRequired?: boolean; message?: string }
      | null;
    if (body?.confirmRequired) {
      return {
        ok: false,
        reason: "confirm-required",
        ticketId: input.ticketId,
      };
    }
    return {
      ok: false,
      reason: "other",
      message: body?.message ?? "토큰 교환에 실패했습니다.",
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
    | { customToken?: string; needsTransfer?: boolean }
    | null;
  if (!data?.customToken || typeof data.needsTransfer !== "boolean") {
    return {
      ok: false,
      reason: "other",
      message: "토큰 교환 응답이 올바르지 않습니다.",
    };
  }
  return {
    ok: true,
    customToken: data.customToken,
    needsTransfer: data.needsTransfer,
  };
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
