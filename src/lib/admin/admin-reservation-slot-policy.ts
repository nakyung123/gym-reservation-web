import { isValidReservationDateValue } from "@/lib/reservation-rules";

export const ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT = 200;

export type AdminBulkSlotDateAddResult =
  | { ok: true; dates: string[] }
  | { ok: false; message: string };

export function normalizeAdminBulkSlotDates(
  dates: readonly string[],
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const date of dates) {
    const value = date.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function isAdminBulkSlotDateValue(date: string): boolean {
  return isValidReservationDateValue(date.trim());
}

export function addAdminBulkSlotDate(
  currentDates: readonly string[],
  nextDate: string,
): AdminBulkSlotDateAddResult {
  const value = nextDate.trim();
  if (!value) {
    return { ok: false, message: "적용 날짜를 선택해주세요." };
  }

  if (!isAdminBulkSlotDateValue(value)) {
    return {
      ok: false,
      message: "날짜는 YYYY-MM-DD 형식이어야 합니다.",
    };
  }

  if (normalizeAdminBulkSlotDates(currentDates).includes(value)) {
    return { ok: false, message: "이미 선택한 날짜입니다." };
  }

  return {
    ok: true,
    dates: normalizeAdminBulkSlotDates([...currentDates, value]),
  };
}

export function getAdminBulkSlotTargetCount({
  dateCount,
  timeCount,
}: {
  dateCount: number;
  timeCount: number;
}): number {
  return dateCount * timeCount;
}

export function isAdminBulkSlotTargetOverLimit({
  dateCount,
  timeCount,
}: {
  dateCount: number;
  timeCount: number;
}): boolean {
  return (
    getAdminBulkSlotTargetCount({ dateCount, timeCount }) >
    ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT
  );
}
