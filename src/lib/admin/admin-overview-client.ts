"use client";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";

import { isAbortError } from "@/lib/async-error";
export type AdminReservationOverview = {
  date: string;
  reservations: {
    total: number;
    reserved: number;
    cancelled: number;
    used: number;
  };
  revenue: {
    expected: number;
    used: number;
  };
  slots: {
    total: number;
    available: number;
    full: number;
    closed: number;
    reservedCount: number;
    capacity: number;
  };
};

export type AdminOverviewResult =
  | { ok: true; overview: AdminReservationOverview }
  | { ok: false; message: string; status?: number };

// 일별 예약 상태 추이(대시보드 차트용). 서버 repository와 공유하는 SSOT 타입.
export type AdminReservationTrendPoint = {
  date: string;
  reserved: number;
  cancelled: number;
  used: number;
};

export type AdminOverviewTrendResult =
  | { ok: true; trend: AdminReservationTrendPoint[] }
  | { ok: false; message: string; status?: number };

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}


function isAdminReservationOverview(
  value: unknown,
): value is AdminReservationOverview {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AdminReservationOverview>;
  const reservations = candidate.reservations;
  const revenue = candidate.revenue;
  const slots = candidate.slots;

  return (
    typeof candidate.date === "string" &&
    Boolean(reservations) &&
    typeof reservations === "object" &&
    isNumber(reservations.total) &&
    isNumber(reservations.reserved) &&
    isNumber(reservations.cancelled) &&
    isNumber(reservations.used) &&
    Boolean(revenue) &&
    typeof revenue === "object" &&
    isNumber(revenue.expected) &&
    isNumber(revenue.used) &&
    Boolean(slots) &&
    typeof slots === "object" &&
    isNumber(slots.total) &&
    isNumber(slots.available) &&
    isNumber(slots.full) &&
    isNumber(slots.closed) &&
    isNumber(slots.reservedCount) &&
    isNumber(slots.capacity)
  );
}

function isAdminReservationTrendPoint(
  value: unknown,
): value is AdminReservationTrendPoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<AdminReservationTrendPoint>;
  return (
    typeof candidate.date === "string" &&
    isNumber(candidate.reserved) &&
    isNumber(candidate.cancelled) &&
    isNumber(candidate.used)
  );
}

export async function fetchAdminOverviewTrend(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<AdminOverviewTrendResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  const query = new URLSearchParams({ from, to });

  let response: Response;
  try {
    response = await fetch(`/api/admin/overview/trend?${query.toString()}`, {
      headers: auth.headers,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message: "예약 추이 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { trend?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { trend?: unknown; message?: unknown };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (
    response.ok &&
    Array.isArray(data.trend) &&
    data.trend.every(isAdminReservationTrendPoint)
  ) {
    return { ok: true, trend: data.trend };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "예약 추이 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `예약 추이 조회 실패: status=${response.status}`,
    status: response.status,
  };
}

export async function fetchAdminOverview(
  date: string,
  signal?: AbortSignal,
): Promise<AdminOverviewResult> {
  const auth = await getAdminAuthHeader();
  if (!auth.ok) return { ok: false, message: auth.message, status: 401 };

  let response: Response;
  try {
    response = await fetch(
      `/api/admin/overview?date=${encodeURIComponent(date)}`,
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
      message: "관리자 운영 요약 요청에 실패했습니다. 다시 시도해 주세요.",
    };
  }

  let data: { overview?: unknown; message?: unknown };
  try {
    data = (await response.json()) as {
      overview?: unknown;
      message?: unknown;
    };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isAdminReservationOverview(data.overview)) {
    return { ok: true, overview: data.overview };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "관리자 운영 요약 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `관리자 운영 요약 조회 실패: status=${response.status}`,
    status: response.status,
  };
}
