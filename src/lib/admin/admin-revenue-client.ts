"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isRevenueSummary, type RevenueSummary } from "@/lib/admin/revenue";

import { isAbortError } from "@/lib/async-error";
export type AdminRevenueResult =
  | { ok: true; summary: RevenueSummary }
  | { ok: false; message: string; status?: number };


export async function fetchAdminRevenue(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<AdminRevenueResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(
      `/api/admin/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: auth.headers,
        signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message: "매출/정산 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { summary?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { summary?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isRevenueSummary(data.summary)) {
    return { ok: true, summary: data.summary };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "매출/정산 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `매출/정산 조회 실패: status=${response.status}`,
    status: response.status,
  };
}
