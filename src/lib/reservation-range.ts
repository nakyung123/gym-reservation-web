// 내 예약 목록의 "기간 필터"에서 사용하는 작은 헬퍼 모음.
// 날짜 문자열(YYYY-MM-DD)은 lex 비교가 곧 시간순이므로 별도 Date 파싱 없이
// 문자열 그대로 비교한다. timezone 비의존을 유지하기 위함.

export type ReservationRange = "all" | "week" | "month" | "quarter";

// URL query(?range=...)에서 받은 값을 안전하게 ReservationRange로 변환한다.
// 알 수 없는 값은 "all"로 본다.
export function parseReservationRange(
  value: string | null,
): ReservationRange {
  if (value === "week" || value === "month" || value === "quarter") {
    return value;
  }
  return "all";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// today를 기준으로 ReservationRange가 의미하는 하한 날짜(포함)를 돌려준다.
// "all"이면 null. 입력 today는 YYYY-MM-DD 문자열.
// 잘못된 today는 null을 반환해 호출 측에서 필터 미적용으로 폴백할 수 있게 한다.
export function getReservationRangeLowerBound(
  range: ReservationRange,
  today: string,
): string | null {
  if (range === "all") return null;

  const [year, month, day] = today.split("-").map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const reference = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(reference.getTime())) {
    return null;
  }

  if (range === "week") {
    reference.setUTCDate(reference.getUTCDate() - 7);
  } else if (range === "month") {
    reference.setUTCMonth(reference.getUTCMonth() - 1);
  } else if (range === "quarter") {
    reference.setUTCMonth(reference.getUTCMonth() - 3);
  }

  return `${reference.getUTCFullYear()}-${pad(reference.getUTCMonth() + 1)}-${pad(reference.getUTCDate())}`;
}

// 예약 이용일(reservation.date, YYYY-MM-DD)이 하한 날짜(포함) 이상인지 판정한다.
// lowerBound가 null이면 전체 통과(필터 비활성).
export function isReservationDateInRange(
  reservationDate: string,
  lowerBound: string | null,
): boolean {
  if (!lowerBound) return true;
  return reservationDate >= lowerBound;
}

// UI에 노출할 짧은 라벨. 컴포넌트에서 그대로 쓸 수 있게 SSOT로 둔다.
export const reservationRangeLabels: Record<ReservationRange, string> = {
  all: "전체",
  week: "1주일",
  month: "1개월",
  quarter: "3개월",
};

// 현재 디바이스 시각 기준으로 오늘 날짜(YYYY-MM-DD)를 얻는다.
// 컴포넌트에서 useMemo 등으로 시각을 고정해서 넘길 때 헬퍼와 통일된 포맷을 유지한다.
export function getTodayDateValue(now: Date = new Date()): string {
  return toDateValue(now);
}
