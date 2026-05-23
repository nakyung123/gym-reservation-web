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

// "YYYY-MM-DD"에 days만큼 더한 새 값을 같은 형식으로 반환한다.
// Date 생성자는 day overflow를 자동 정규화하므로 월말/윤년/일수 초과를 모두
// 안전하게 처리한다. 형식이 잘못되거나 Date가 invalid면 null.
const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function addDaysToDateValue(value: string, days: number): string | null {
  const match = DATE_VALUE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, yearText, monthText, dayText] = match;
  const date = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText) + days,
  );
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
