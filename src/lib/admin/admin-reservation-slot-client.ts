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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
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

  return {
    ok: false,
    message:
      typeof data.message === "string"
        ? data.message
        : `슬롯 정책 변경 실패: status=${response.status}`,
    status: response.status,
  };
}
