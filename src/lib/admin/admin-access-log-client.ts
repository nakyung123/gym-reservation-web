"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import { isAbortError } from "@/lib/async-error";
import {
  isAdminAccessLogEntry,
  type AdminAccessLogEntry,
} from "@/lib/admin/access-log";

// 관리자 콘솔 접속을 서버에 1건 기록한다(부가 기록).
// 미로그인이거나 네트워크 실패면 조용히 넘어간다 — 접속 핑 실패가 콘솔 사용을
// 방해해서는 안 되기 때문이다. 세션당 1회 제한은 호출 측(AdminAccessPing)이 담당한다.
export async function pingAdminAccess(path: string): Promise<void> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return;

  try {
    await fetch("/api/admin/access-logs", {
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      // 페이지 전환 중에도 요청이 유실되지 않도록.
      keepalive: true,
    });
  } catch {
    // 핑 실패는 무시(best-effort).
  }
}

export type AdminAccessLogListResult =
  | { ok: true; accessLogs: AdminAccessLogEntry[] }
  | { ok: false; message: string; status?: number };

export type AdminAccessLogFilters = {
  adminUid?: string;
  limit?: number;
};

function buildUrl(filters: AdminAccessLogFilters): string {
  const params = new URLSearchParams();
  if (filters.adminUid) params.set("adminUid", filters.adminUid);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `/api/admin/access-logs?${query}` : "/api/admin/access-logs";
}

export async function fetchAdminAccessLogs(
  filters: AdminAccessLogFilters = {},
  signal?: AbortSignal,
): Promise<AdminAccessLogListResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(buildUrl(filters), { headers: auth.headers, signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ok: false,
      message: "접속 기록 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { accessLogs?: unknown; message?: unknown };
  try {
    data = (await response.json()) as {
      accessLogs?: unknown;
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
    Array.isArray(data.accessLogs) &&
    data.accessLogs.every(isAdminAccessLogEntry)
  ) {
    return { ok: true, accessLogs: data.accessLogs };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "접속 기록 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `접속 기록 조회 실패: status=${response.status}`,
    status: response.status,
  };
}
