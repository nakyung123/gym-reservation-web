"use client";

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

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
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

export async function fetchAdminOverview(
  date: string,
  token: string,
  signal?: AbortSignal,
): Promise<AdminOverviewResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/admin/overview?date=${encodeURIComponent(date)}`,
      {
        headers: { "x-admin-token": token },
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
