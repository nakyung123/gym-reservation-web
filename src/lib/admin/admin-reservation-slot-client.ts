"use client";

import { isReservationSlotAvailability } from "@/lib/reservation-slot-availability";
import type { ReservationSlotAvailability, Sport } from "@/types/domain";

export type AdminUpdateSlotInput = {
  gymId: string;
  sport: Sport;
  date: string;
  time: string;
  capacity?: number;
  isClosed?: boolean;
};

export type AdminUpdateSlotResult =
  | { ok: true; slot: ReservationSlotAvailability }
  | { ok: false; message: string; status?: number };

export type AdminBulkUpdateSlotInput = {
  gymId: string;
  sport: Sport;
  dates: string[];
  times: string[];
  capacity?: number;
  isClosed?: boolean;
};

export type AdminBulkUpdateSlotResult =
  | { ok: true; slots: ReservationSlotAvailability[]; updatedCount: number }
  | {
      ok: false;
      kind: "conflict";
      message: string;
      conflicts: ReservationSlotAvailability[];
      status: 409;
    }
  | { ok: false; kind: "error"; message: string; status?: number };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isValidUpdatedCount(value: unknown, slots: unknown[]): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value === slots.length
  );
}

export async function updateReservationSlotPolicy(
  input: AdminUpdateSlotInput,
  token: string,
  signal?: AbortSignal,
): Promise<AdminUpdateSlotResult> {
  let response: Response;
  try {
    response = await fetch("/api/admin/reservation-slots", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      message:
        `슬롯 정책 변경 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: { slot?: unknown; message?: unknown; status?: unknown };
  try {
    data = (await response.json()) as {
      slot?: unknown;
      message?: unknown;
      status?: unknown;
    };
  } catch {
    return {
      ok: false,
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.ok && isReservationSlotAvailability(data.slot)) {
    return { ok: true, slot: data.slot };
  }

  if (response.ok) {
    return {
      ok: false,
      message: "슬롯 정책 변경 응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `슬롯 정책 변경 실패: status=${response.status}`,
    status: response.status,
  };
}

export async function bulkUpdateReservationSlotPolicy(
  input: AdminBulkUpdateSlotInput,
  token: string,
  signal?: AbortSignal,
): Promise<AdminBulkUpdateSlotResult> {
  let response: Response;
  try {
    response = await fetch("/api/admin/reservation-slots/bulk", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      ok: false,
      kind: "error",
      message:
        `슬롯 일괄 변경 요청에 실패했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: {
    slots?: unknown;
    updatedCount?: unknown;
    conflicts?: unknown;
    message?: unknown;
  };
  try {
    data = (await response.json()) as {
      slots?: unknown;
      updatedCount?: unknown;
      conflicts?: unknown;
      message?: unknown;
    };
  } catch {
    return {
      ok: false,
      kind: "error",
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  if (response.status === 409) {
    const rawConflicts = Array.isArray(data.conflicts) ? data.conflicts : null;
    if (rawConflicts === null) {
      return {
        ok: false,
        kind: "error",
        message:
          typeof data.message === "string"
            ? data.message
            : "충돌 응답 형식이 올바르지 않습니다.",
        status: 409,
      };
    }
    const conflicts = rawConflicts.filter(isReservationSlotAvailability);
    if (conflicts.length !== rawConflicts.length) {
      return {
        ok: false,
        kind: "error",
        message: "충돌 응답 형식이 올바르지 않습니다.",
        status: 409,
      };
    }
    return {
      ok: false,
      kind: "conflict",
      message:
        typeof data.message === "string"
          ? data.message
          : "이미 예약된 시간대가 있어 일괄 변경을 적용할 수 없습니다.",
      conflicts,
      status: 409,
    };
  }

  if (response.ok) {
    const rawSlots = Array.isArray(data.slots) ? data.slots : null;
    if (
      rawSlots !== null &&
      rawSlots.every(isReservationSlotAvailability) &&
      isValidUpdatedCount(data.updatedCount, rawSlots)
    ) {
      return {
        ok: true,
        slots: rawSlots,
        updatedCount: data.updatedCount,
      };
    }
    return {
      ok: false,
      kind: "error",
      message: "응답 형식이 올바르지 않습니다.",
      status: response.status,
    };
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data.message === "string"
        ? data.message
        : `슬롯 일괄 변경 실패: status=${response.status}`,
    status: response.status,
  };
}
