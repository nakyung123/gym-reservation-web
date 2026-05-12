import type { ReservationStatus, Sport } from "@/types/domain";

export const SPORTS = [
  "배드민턴",
  "농구",
  "풋살",
  "탁구",
  "배구",
] as const satisfies readonly Sport[];

export const RESERVATION_STATUSES = [
  "reserved",
  "cancelled",
  "used",
] as const satisfies readonly ReservationStatus[];

export function isSport(value: unknown): value is Sport {
  return (
    typeof value === "string" && (SPORTS as readonly string[]).includes(value)
  );
}

export function isReservationStatus(
  value: unknown,
): value is ReservationStatus {
  return (
    typeof value === "string" &&
    (RESERVATION_STATUSES as readonly string[]).includes(value)
  );
}
