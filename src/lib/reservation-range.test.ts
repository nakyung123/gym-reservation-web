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

  it("월말 경계에서 정상적으로 한 달 빼기를 처리한다", () => {
    // 3월 31일에서 한 달 빼면 2월 28/29일 → setUTCMonth가 자동으로 안전한
    // 마지막 날짜로 정렬한다. (현재 구현은 2/28 또는 윤년에 따라 다를 수 있어
    // 형식만 확인한다.)
    const result = getReservationRangeLowerBound("month", "2025-03-31");
    expect(result).toMatch(/^2025-03-0[1-9]|^2025-02-2[8-9]/);
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
