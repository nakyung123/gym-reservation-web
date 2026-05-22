import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 카카오 OAuth 흐름의 클라이언트 측 helper.
// /start → window.location → /callback → /auth/handover → /token →
// signInWithCustomToken → /finalize.
// customToken은 절대 URL/스토리지에 남기지 않고 POST response body로만 받는다.
// 익명 흐름 제거 후 anonUid/migration 없음. retry는 finalize-only.

export type StartKakaoLoginResult =
  | { ok: true }
  | { ok: false; message: string };

export type FinalizeKakaoResult =
  | { ok: true; profileSynced: boolean }
  | {
      ok: false;
      reason: "retryable" | "other";
      message: string;
      ticketId?: string;
    };

export async function startKakaoLogin(): Promise<StartKakaoLoginResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/kakao/start", { method: "POST" });
  } catch {
    return {
      ok: false,
      message: "카카오 로그인 시작 요청에 실패했습니다. 다시 시도해 주세요.",
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
}): Promise<FinalizeKakaoResult> {
  const tokenResult = await exchangeTicketForCustomToken(input.ticketId);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const { auth } = getFirebaseClient();
  try {
    await signInWithCustomToken(auth, tokenResult.customToken);
  } catch {
    return {
      ok: false,
      reason: "other",
      message: "카카오 로그인에 실패했습니다. 처음부터 다시 시도해 주세요.",
    };
  }

  return callFinalize(input.ticketId);
}

// migration 충돌 등 retryable 응답 시, signInWithCustomToken은 이미 끝난 상태이므로
// finalize만 재호출한다.
export async function retryKakaoFinalize(input: {
  ticketId: string;
}): Promise<FinalizeKakaoResult> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      reason: "other",
      message:
        "로그인 세션이 만료됐습니다. 카카오 연결을 처음부터 다시 시도해 주세요.",
    };
  }
  return callFinalize(input.ticketId);
}

async function callFinalize(ticketId: string): Promise<FinalizeKakaoResult> {
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
  } catch {
    return {
      ok: false,
      reason: "other",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
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
      body: JSON.stringify({ ticketId }),
    });
  } catch {
    return {
      ok: false,
      reason: "other",
      message: "로그인 마감 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  if (response.status === 409 || response.status === 500) {
    const body = (await response.json().catch(() => null)) as
      | { retryable?: boolean; message?: string }
      | null;
    if (body?.retryable) {
      return {
        ok: false,
        reason: "retryable",
        message: body.message ?? "로그인 마감에 실패했습니다.",
        ticketId,
      };
    }
    return {
      ok: false,
      reason: "other",
      message: body?.message ?? "로그인 마감에 실패했습니다.",
    };
  }
  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `로그인 마감 실패. status=${response.status}`,
    );
    return { ok: false, reason: "other", message };
  }

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; profileSynced?: boolean }
    | null;

  // server에서 admin.updateUser로 displayName/email/photoURL을 갱신했지만
  // currentUser는 signInWithCustomToken 시점 캐시. forced refresh로 token 받은 뒤 reload.
  try {
    await user.getIdToken(true);
    await user.reload();
  } catch (error) {
    console.warn("[kakao finalize] currentUser refresh failed:", error);
  }

  return {
    ok: true,
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
  } catch {
    return {
      ok: false,
      reason: "other",
      message: "토큰 교환 요청에 실패했습니다. 다시 시도해 주세요.",
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

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;
  return body?.message ?? fallback;
}
