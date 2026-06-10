"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  isCustomerDetail,
  isCustomerSummary,
  type CustomerDetail,
  type CustomerSummary,
} from "@/lib/admin/customer";
import { isCustomerNote, type CustomerNote } from "@/lib/admin/customer-note";

export type AdminCustomerListResult =
  | { ok: true; customers: CustomerSummary[] }
  | { ok: false; message: string; status?: number };

export type AdminCustomerDetailResult =
  | { ok: true; detail: CustomerDetail; notes: CustomerNote[] }
  | { ok: false; message: string; status?: number };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getMessage(data: { message?: unknown }, fallback: string) {
  return typeof data.message === "string" ? data.message : fallback;
}

function buildCustomersUrl(filters: { q?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `/api/admin/customers?${query}` : "/api/admin/customers";
}

export async function fetchAdminCustomers(
  filters: { q?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<AdminCustomerListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(buildCustomersUrl(filters), {
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "고객 목록 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { customers?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { customers?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    Array.isArray(data.customers) &&
    data.customers.every(isCustomerSummary)
  ) {
    return { ok: true, customers: data.customers };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "고객 목록 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `고객 목록 조회 실패: status=${response.status}`),
    status: response.status,
  };
}

export async function fetchAdminCustomerDetail(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminCustomerDetailResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(
      `/api/admin/customers/${encodeURIComponent(userId)}`,
      { headers: auth.headers, signal },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "고객 상세 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { detail?: unknown; notes?: unknown; message?: unknown };
  try {
    data = (await response.json()) as {
      detail?: unknown;
      notes?: unknown;
      message?: unknown;
    };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    isCustomerDetail(data.detail) &&
    Array.isArray(data.notes) &&
    data.notes.every(isCustomerNote)
  ) {
    return { ok: true, detail: data.detail, notes: data.notes };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "고객 상세 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `고객 상세 조회 실패: status=${response.status}`),
    status: response.status,
  };
}
