"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isAuditLogEntry, type AuditLogEntry } from "@/lib/admin/audit-log";

export type AdminAuditLogFilters = {
  action?: string;
  targetType?: string;
  targetId?: string;
  adminUid?: string;
  limit?: number;
};

export type AdminAuditLogListResult =
  | { ok: true; auditLogs: AuditLogEntry[] }
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

function buildUrl(filters: AdminAuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.targetType) params.set("targetType", filters.targetType);
  if (filters.targetId) params.set("targetId", filters.targetId);
  if (filters.adminUid) params.set("adminUid", filters.adminUid);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `/api/admin/audit-logs?${query}` : "/api/admin/audit-logs";
}

export async function fetchAdminAuditLogs(
  filters: AdminAuditLogFilters = {},
  signal?: AbortSignal,
): Promise<AdminAuditLogListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(buildUrl(filters), { headers: auth.headers, signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "운영 이력 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { auditLogs?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { auditLogs?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    Array.isArray(data.auditLogs) &&
    data.auditLogs.every(isAuditLogEntry)
  ) {
    return { ok: true, auditLogs: data.auditLogs };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "운영 이력 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message: getMessage(data, `운영 이력 조회 실패: status=${response.status}`),
    status: response.status,
  };
}
