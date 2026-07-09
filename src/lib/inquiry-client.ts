"use client";

import { getFirebaseClient } from "@/lib/firebase-client";
import { isInquiry, validateInquiryInput, type InquiryInput } from "@/lib/inquiry";
import type { Inquiry } from "@/types/domain";

import { isAbortError } from "@/lib/async-error";
// 마이페이지 1:1 문의 client 접근 계층. reactive repository가 아니라 fetch 헬퍼.
// user-profile-client.ts와 동일하게 throw 대신 { ok, ... } 결과 객체를 반환한다.

type InquiryClientFailure = {
  ok: false;
  kind: "auth-required" | "not-found" | "error";
  message: string;
  status?: number;
};

export type CreateInquiryResult =
  | { ok: true; inquiry: Inquiry }
  | InquiryClientFailure;

export type FetchMyInquiriesResult =
  | { ok: true; inquiries: Inquiry[]; total: number }
  | InquiryClientFailure;

export type FetchInquiryResult =
  | { ok: true; inquiry: Inquiry }
  | InquiryClientFailure;

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; kind: "auth-required" | "error"; message: string };


async function getIdToken(): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return {
        ok: false,
        kind: "auth-required",
        message: "로그인 정보가 없어 문의를 처리할 수 없습니다.",
      };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

async function readJson(
  response: Response,
): Promise<{ inquiry?: unknown; inquiries?: unknown; total?: unknown; message?: unknown }> {
  try {
    return (await response.json()) as {
      inquiry?: unknown;
      inquiries?: unknown;
      total?: unknown;
      message?: unknown;
    };
  } catch {
    return { message: "문의 응답 형식이 올바르지 않습니다." };
  }
}

function getMessage(data: { message?: unknown }, fallback: string): string {
  return typeof data.message === "string" ? data.message : fallback;
}

function authOrError(
  status: number,
  data: { message?: unknown },
  fallback: string,
): InquiryClientFailure {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      kind: "auth-required",
      message: getMessage(data, "로그인 상태가 필요합니다."),
      status,
    };
  }
  return { ok: false, kind: "error", message: getMessage(data, fallback), status };
}

export async function createInquiry(input: InquiryInput): Promise<CreateInquiryResult> {
  const validation = validateInquiryInput(input);
  if (!validation.ok) {
    return { ok: false, kind: "error", message: validation.message };
  }

  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch("/api/inquiries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validation.input),
    });
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "문의 등록 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJson(response);
  if (response.ok && isInquiry(data.inquiry)) {
    return { ok: true, inquiry: data.inquiry };
  }
  if (response.ok) {
    return { ok: false, kind: "error", message: "문의 응답 형식이 올바르지 않습니다." };
  }
  return authOrError(response.status, data, `문의 등록 실패: status=${response.status}`);
}

export async function fetchMyInquiries(
  page = 1,
  signal?: AbortSignal,
): Promise<FetchMyInquiriesResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch(`/api/inquiries?page=${encodeURIComponent(String(page))}`, {
      headers: { Authorization: `Bearer ${token.idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message: "문의 목록 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJson(response);
  if (
    response.ok &&
    Array.isArray(data.inquiries) &&
    data.inquiries.every(isInquiry) &&
    typeof data.total === "number"
  ) {
    return { ok: true, inquiries: data.inquiries, total: data.total };
  }
  if (response.ok) {
    return { ok: false, kind: "error", message: "문의 응답 형식이 올바르지 않습니다." };
  }
  return authOrError(response.status, data, `문의 목록 조회 실패: status=${response.status}`);
}

export async function fetchInquiry(
  id: string,
  signal?: AbortSignal,
): Promise<FetchInquiryResult> {
  const token = await getIdToken();
  if (!token.ok) {
    return token;
  }

  let response: Response;
  try {
    response = await fetch(`/api/inquiries/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token.idToken}` },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message: "문의 조회 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  const data = await readJson(response);
  if (response.ok && isInquiry(data.inquiry)) {
    return { ok: true, inquiry: data.inquiry };
  }
  if (response.ok) {
    return { ok: false, kind: "error", message: "문의 응답 형식이 올바르지 않습니다." };
  }
  if (response.status === 404) {
    return {
      ok: false,
      kind: "not-found",
      message: getMessage(data, "문의를 찾을 수 없습니다."),
      status: 404,
    };
  }
  return authOrError(response.status, data, `문의 조회 실패: status=${response.status}`);
}
