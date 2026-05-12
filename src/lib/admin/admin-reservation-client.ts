"use client";

import { isReservation } from "@/lib/reservation-repository";
import type { Reservation, ReservationStatus } from "@/types/domain";

export type AdminReservationFilters = {
  status?: ReservationStatus;
  gymId?: string;
  date?: string;
  userId?: string;
  limit?: number;
};

export type AdminReservationListResult =
  | { ok: true; reservations: Reservation[] }
  | { ok: false; message: string; status?: number };

export type AdminReservationDetailResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; message: string; status?: number };

export type AdminReservationActionStatus =
  | "used"
  | "cancelled"
  | "unchanged";

export type AdminReservationActionResult =
  | {
      ok: true;
      status: AdminReservationActionStatus;
      reservation: Reservation;
      message: string;
    }
  | {
      ok: false;
      message: string;
      status?: number;
      reservation?: Reservation;
    };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getMessage(data: { message?: unknown }, fallback: string) {
  return typeof data.message === "string" ? data.message : fallback;
}

function buildReservationsUrl(filters: AdminReservationFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.gymId) params.set("gymId", filters.gymId);
  if (filters.date) params.set("date", filters.date);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));

  const query = params.toString();
  return query ? `/api/admin/reservations?${query}` : "/api/admin/reservations";
}

export async function fetchAdminReservation(
  reservationId: string,
  token: string,
  signal?: AbortSignal,
): Promise<AdminReservationDetailResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/admin/reservations/${encodeURIComponent(reservationId)}`,
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
      message:
        `관리자 예약 상세 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: { reservation?: unknown; message?: unknown };
  try {
    data = (await response.json()) as {
      reservation?: unknown;
      message?: unknown;
    };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isReservation(data.reservation)) {
    return { ok: true, reservation: data.reservation };
  }

  return {
    ok: false,
    message: getMessage(data, `관리자 예약 상세 조회 실패: status=${response.status}`),
    status: response.status,
  };
}

export async function fetchAdminReservations(
  filters: AdminReservationFilters,
  token: string,
  signal?: AbortSignal,
): Promise<AdminReservationListResult> {
  let response: Response;
  try {
    response = await fetch(buildReservationsUrl(filters), {
      headers: { "x-admin-token": token },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message:
        `관리자 예약 목록 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: { reservations?: unknown; message?: unknown };
  try {
    data = (await response.json()) as {
      reservations?: unknown;
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
    Array.isArray(data.reservations) &&
    data.reservations.every(isReservation)
  ) {
    return { ok: true, reservations: data.reservations };
  }

  return {
    ok: false,
    message: getMessage(data, `관리자 예약 목록 조회 실패: status=${response.status}`),
    status: response.status,
  };
}

export async function updateAdminReservationStatus(
  reservationId: string,
  status: "used" | "cancelled",
  token: string,
  signal?: AbortSignal,
): Promise<AdminReservationActionResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/admin/reservations/${encodeURIComponent(reservationId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ status }),
        signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message:
        `관리자 예약 상태 변경 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: {
    status?: unknown;
    reservation?: unknown;
    message?: unknown;
  };
  try {
    data = (await response.json()) as {
      status?: unknown;
      reservation?: unknown;
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
    (data.status === "used" ||
      data.status === "cancelled" ||
      data.status === "unchanged") &&
    isReservation(data.reservation)
  ) {
    return {
      ok: true,
      status: data.status,
      reservation: data.reservation,
      message: getMessage(data, "예약 상태가 변경되었습니다."),
    };
  }

  return {
    ok: false,
    message: getMessage(data, `관리자 예약 상태 변경 실패: status=${response.status}`),
    status: response.status,
    reservation: isReservation(data.reservation) ? data.reservation : undefined,
  };
}
