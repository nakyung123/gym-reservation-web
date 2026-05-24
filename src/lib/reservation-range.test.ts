import { describe, expect, it } from "vitest";
import {
  getReservationRangeLowerBound,
  getTodayDateValue,
  isReservationDateInRange,
  parseReservationRange,
} from "@/lib/reservation-range";

describe("parseReservationRange", () => {
  it("지원 값은 그대로 반환한다", () => {
    expect(parseReservationRange("week")).toBe("week");
    expect(parseReservationRange("month")).toBe("month");
    expect(parseReservationRange("quarter")).toBe("quarter");
  });

  it("null·빈 값·미지원 값은 all로 폴백한다", () => {
    expect(parseReservationRange(null)).toBe("all");
    expect(parseReservationRange("")).toBe("all");
    expect(parseReservationRange("year")).toBe("all");
  });
});

describe("getReservationRangeLowerBound", () => {
  it("all은 null을 반환해 필터를 비활성화한다", () => {
    expect(getReservationRangeLowerBound("all", "2026-05-24")).toBeNull();
  });

  it("week는 오늘에서 7일 전을 돌려준다", () => {
    expect(getReservationRangeLowerBound("week", "2026-05-24")).toBe(
      "2026-05-17",
    );
  });

  it("month는 오늘에서 한 달 전을 돌려준다", () => {
    expect(getReservationRangeLowerBound("month", "2026-05-24")).toBe(
      "2026-04-24",
    );
  });

  it("quarter는 오늘에서 세 달 전을 돌려준다", () => {
    expect(getReservationRangeLowerBound("quarter", "2026-05-24")).toBe(
      "2026-02-24",
    );
  });

  it("month: 3월 31일에서 한 달 빼면 2월 28일로 clamp한다 (평년)", () => {
    expect(getReservationRangeLowerBound("month", "2025-03-31")).toBe(
      "2025-02-28",
    );
  });

  it("month: 윤년 3월 31일은 2월 29일로 clamp한다", () => {
    expect(getReservationRangeLowerBound("month", "2024-03-31")).toBe(
      "2024-02-29",
    );
  });

  it("month: 5월 31일에서 한 달 빼면 4월 30일로 clamp한다", () => {
    expect(getReservationRangeLowerBound("month", "2026-05-31")).toBe(
      "2026-04-30",
    );
  });

  it("month: 1월 31일에서 한 달 빼면 전년 12월 31일이다", () => {
    expect(getReservationRangeLowerBound("month", "2026-01-31")).toBe(
      "2025-12-31",
    );
  });

  it("quarter: 5월 31일에서 세 달 빼면 2월 28일로 clamp한다", () => {
    expect(getReservationRangeLowerBound("quarter", "2025-05-31")).toBe(
      "2025-02-28",
    );
  });

  it("quarter: 윤년 5월 31일에서 세 달 빼면 2월 29일로 clamp한다", () => {
    expect(getReservationRangeLowerBound("quarter", "2024-05-31")).toBe(
      "2024-02-29",
    );
  });

  it("quarter: 1월 31일에서 세 달 빼면 전년 10월 31일이다", () => {
    expect(getReservationRangeLowerBound("quarter", "2026-01-31")).toBe(
      "2025-10-31",
    );
  });

  it("잘못된 today 입력은 null을 반환한다", () => {
    expect(getReservationRangeLowerBound("week", "")).toBeNull();
    expect(getReservationRangeLowerBound("week", "abcd-ef-gh")).toBeNull();
  });
});

describe("isReservationDateInRange", () => {
  it("lowerBound가 null이면 모두 통과한다", () => {
    expect(isReservationDateInRange("2020-01-01", null)).toBe(true);
    expect(isReservationDateInRange("2030-12-31", null)).toBe(true);
  });

  it("이용일이 하한 이상이면 true, 미만이면 false", () => {
    const lower = "2026-05-17";
    expect(isReservationDateInRange("2026-05-17", lower)).toBe(true);
    expect(isReservationDateInRange("2026-05-18", lower)).toBe(true);
    expect(isReservationDateInRange("2026-05-16", lower)).toBe(false);
  });
});

describe("getTodayDateValue", () => {
  it("YYYY-MM-DD 형식으로 돌려준다", () => {
    const fixed = new Date(2026, 4, 24);
    expect(getTodayDateValue(fixed)).toBe("2026-05-24");
  });
});
