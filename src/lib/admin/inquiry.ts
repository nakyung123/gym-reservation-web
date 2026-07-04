"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isInquiry, validateInquiryAnswer } from "@/lib/inquiry";
import type { Inquiry, InquiryStatus } from "@/types/domain";

// 관리자 1:1 문의 client 접근 계층(admin fetch 패턴 재사용).

export type AdminInquiry = Inquiry & { userLabel: string };

export type AdminInquiryListResult =
  | { ok: true; inquiries: AdminInquiry[]; total: number }
  | { ok: false; message: string; status?: number };

export type AdminInquiryAnswerResult =
  | { ok: true; inquiry: Inquiry; message: string }
  | { ok: false; message: string; status?: number };

// 목록 필터: 상태값 또는 "all"(전체).
export type AdminInquiryStatusFilter = InquiryStatus | "all";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isAdminInquiry(value: unknown): value is AdminInquiry {
  return (
    isInquiry(value) &&
    typeof (value as { userLabel?: unknown }).userLabel === "string"
  );
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
    return { message: "응답 형식이 올바르지 않습니다." };
  }
}

function getMessage(data: { message?: unknown }, fallback: string): string {
  return typeof data.message === "string" ? data.message : fallback;
}

export async function fetchAdminInquiries(
  { status = "all", page = 1 }: { status?: AdminInquiryStatusFilter; page?: number } = {},
  signal?: AbortSignal,
): Promise<AdminInquiryListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  const query = new URLSearchParams({ status, page: String(page) });

  let response: Response;
  try {
    response = await fetch(`/api/admin/inquiries?${query.toString()}`, {
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return { ok: false, message: "문의 목록 요청에 실패했습니다. 다시 시도해 주세요." };
  }

  const data = await readJson(response);
  if (
    response.ok &&
    Array.isArray(data.inquiries) &&
    data.inquiries.every(isAdminInquiry) &&
    typeof data.total === "number"
  ) {
    return { ok: true, inquiries: data.inquiries, total: data.total };
  }
  if (response.ok) {
    return { ok: false, message: "문의 응답 형식이 올바르지 않습니다." };
  }
  return {
    ok: false,
    message: getMessage(data, `문의 목록 조회 실패: status=${response.status}`),
    status: response.status,
  };
}

export async function answerInquiry(
  id: string,
  answer: string,
  signal?: AbortSignal,
): Promise<AdminInquiryAnswerResult> {
  const validation = validateInquiryAnswer(answer);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ answer: validation.answer }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return { ok: false, message: "답변 저장 요청에 실패했습니다. 다시 시도해 주세요." };
  }

  const data = await readJson(response);
  if (response.ok && isInquiry(data.inquiry)) {
    return { ok: true, inquiry: data.inquiry, message: "답변을 저장했습니다." };
  }
  if (response.ok) {
    return { ok: false, message: "문의 응답 형식이 올바르지 않습니다." };
  }
  return {
    ok: false,
    message: getMessage(data, `답변 저장 실패: status=${response.status}`),
    status: response.status,
  };
}
