// 매출/정산 v1의 client-safe 타입과 표시 라벨.
// 매출 숫자의 SSOT는 서버 repository(getRevenueSummary)가 reservation.price 합으로 계산한다.
// 주의: 결제 연동 전이므로 여기서 "매출"은 장부상 예약가치(booking value)이며 실제 수금액이 아니다.
// 취소(cancelled)는 expected/used 어느 쪽에도 포함되지 않는다.

export type RevenueBasis = "used" | "expected";

export const REVENUE_BASIS_LABEL: Record<RevenueBasis, string> = {
  used: "정산 기준 (이용완료)",
  expected: "전망 (예약+이용)",
};

// 시설 이름을 join하지 못한 경우(이론상 FK라 발생하지 않지만 방어적으로) 쓰는 표시값.
export const UNKNOWN_GYM_NAME = "(이름 미확인 시설)";

export type RevenueReservationCounts = {
  total: number;
  reserved: number;
  cancelled: number;
  used: number;
};

export type RevenueAmount = {
  // status in [reserved, used] 의 price 합 (전망)
  expected: number;
  // status = used 의 price 합 (정산 기준)
  used: number;
};

export type GymRevenueRow = {
  gymId: string;
  gymName: string;
  counts: RevenueReservationCounts;
  revenue: RevenueAmount;
};

export type RevenueSummary = {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  counts: RevenueReservationCounts;
  revenue: RevenueAmount;
  // 기간 내 예약 활동(예약/이용/취소)이 있는 시설만 포함하며 usedRevenue 내림차순으로 정렬한다.
  // 활동이 전혀 없는 시설은 빠진다(취소만 있는 시설은 매출 0으로 표 하단에 남는다).
  gyms: GymRevenueRow[];
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRevenueReservationCounts(
  value: unknown,
): value is RevenueReservationCounts {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RevenueReservationCounts>;
  return (
    isNumber(candidate.total) &&
    isNumber(candidate.reserved) &&
    isNumber(candidate.cancelled) &&
    isNumber(candidate.used)
  );
}

function isRevenueAmount(value: unknown): value is RevenueAmount {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RevenueAmount>;
  return isNumber(candidate.expected) && isNumber(candidate.used);
}

function isGymRevenueRow(value: unknown): value is GymRevenueRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<GymRevenueRow>;
  return (
    typeof candidate.gymId === "string" &&
    typeof candidate.gymName === "string" &&
    isRevenueReservationCounts(candidate.counts) &&
    isRevenueAmount(candidate.revenue)
  );
}

export function isRevenueSummary(value: unknown): value is RevenueSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RevenueSummary>;
  return (
    typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    isRevenueReservationCounts(candidate.counts) &&
    isRevenueAmount(candidate.revenue) &&
    Array.isArray(candidate.gyms) &&
    candidate.gyms.every(isGymRevenueRow)
  );
}
