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

// 데모 시드(prisma/seed-demo-reservations.mjs)가 만드는 예약 id의 prefix(SSOT).
// 운영 집계는 이 prefix를 "제외"하고, Sheets 데모 원장은 이 prefix만 "포함"해
// 데모/운영 데이터를 격리한다. .mjs 시드는 TS import가 안 되므로 같은 리터럴을 자체 보유한다
// — 값을 바꾸면 양쪽(여기 + seed-demo-reservations.mjs의 DEMO_PREFIX)을 함께 고쳐야 한다.
export const DEMO_RESERVATION_ID_PREFIX = "demo-rev-";

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
