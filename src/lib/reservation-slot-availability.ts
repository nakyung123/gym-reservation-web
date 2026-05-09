"use client";

import type { ReservationSlotAvailability, Sport } from "@/types/domain";

export type ReservationSlotsFetchResult =
  | { ok: true; slots: ReservationSlotAvailability[] }
  | { ok: false; message: string };

export function isReservationSlotAvailability(
  value: unknown,
): value is ReservationSlotAvailability {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReservationSlotAvailability>;

  return (
    typeof candidate.gymId === "string" &&
    typeof candidate.sport === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.capacity === "number" &&
    Number.isFinite(candidate.capacity) &&
    typeof candidate.reservedCount === "number" &&
    Number.isFinite(candidate.reservedCount) &&
    typeof candidate.remaining === "number" &&
    Number.isFinite(candidate.remaining) &&
    (candidate.status === "available" || candidate.status === "full")
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function fetchReservationSlots(input: {
  gymId: string;
  sport: Sport;
  date: string;
  signal?: AbortSignal;
}): Promise<ReservationSlotsFetchResult> {
  const params = new URLSearchParams({
    gymId: input.gymId,
    sport: input.sport,
    date: input.date,
  });

  let response: Response;
  try {
    response = await fetch(`/api/reservation-slots?${params.toString()}`, {
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      // 호출자가 중단을 인지할 수 있도록 그대로 전파.
      throw error;
    }
    return {
      ok: false,
      message: `슬롯 정보를 불러오지 못했습니다. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  let data: { slots?: unknown; message?: unknown };
  try {
    data = (await response.json()) as { slots?: unknown; message?: unknown };
  } catch {
    return { ok: false, message: "슬롯 응답 형식이 올바르지 않습니다." };
  }

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof data.message === "string"
          ? data.message
          : `슬롯 정보를 불러오지 못했습니다. status=${response.status}`,
    };
  }

  if (
    !Array.isArray(data.slots) ||
    !data.slots.every(isReservationSlotAvailability)
  ) {
    return { ok: false, message: "슬롯 응답 형식이 올바르지 않습니다." };
  }

  return { ok: true, slots: data.slots };
}
