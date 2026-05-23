import { describe, expect, it } from "vitest";
import {
  ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT,
  addAdminBulkSlotDate,
  addDaysToDateValue,
  getAdminBulkSlotTargetCount,
  isAdminBulkSlotTargetOverLimit,
  isAdminBulkSlotDateValue,
  normalizeAdminBulkSlotDates,
} from "@/lib/admin/admin-reservation-slot-policy";

describe("admin reservation slot policy helpers", () => {
  it("normalizes bulk target dates without changing their first-seen order", () => {
    expect(
      normalizeAdminBulkSlotDates([
        "2026-05-20",
        " 2026-05-21 ",
        "2026-05-20",
        "",
        "2026-05-22",
      ]),
    ).toEqual(["2026-05-20", "2026-05-21", "2026-05-22"]);
  });

  it("validates real YYYY-MM-DD date values", () => {
    expect(isAdminBulkSlotDateValue("2026-05-20")).toBe(true);
    expect(isAdminBulkSlotDateValue("2026-02-30")).toBe(false);
    expect(isAdminBulkSlotDateValue("2026/05/20")).toBe(false);
  });

  it("adds a new valid date to the current target set", () => {
    expect(
      addAdminBulkSlotDate(["2026-05-20"], "2026-05-21"),
    ).toEqual({
      ok: true,
      dates: ["2026-05-20", "2026-05-21"],
    });
  });

  it("rejects empty, invalid, and duplicate date additions", () => {
    expect(addAdminBulkSlotDate(["2026-05-20"], "")).toEqual({
      ok: false,
      message: "적용 날짜를 선택해주세요.",
    });
    expect(addAdminBulkSlotDate(["2026-05-20"], "2026-02-30")).toEqual({
      ok: false,
      message: "날짜는 YYYY-MM-DD 형식이어야 합니다.",
    });
    expect(addAdminBulkSlotDate(["2026-05-20"], "2026-05-20")).toEqual({
      ok: false,
      message: "이미 선택한 날짜입니다.",
    });
  });

  it("calculates whether a bulk date/time target is over the server limit", () => {
    expect(
      getAdminBulkSlotTargetCount({ dateCount: 5, timeCount: 4 }),
    ).toBe(20);
    expect(
      isAdminBulkSlotTargetOverLimit({
        dateCount: ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT,
        timeCount: 1,
      }),
    ).toBe(false);
    expect(
      isAdminBulkSlotTargetOverLimit({
        dateCount: ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT + 1,
        timeCount: 1,
      }),
    ).toBe(true);
  });
});

describe("addDaysToDateValue", () => {
  it("adds N days within the same month and pads zero-prefixed parts", () => {
    expect(addDaysToDateValue("2026-05-20", 7)).toBe("2026-05-27");
    expect(addDaysToDateValue("2026-05-01", 1)).toBe("2026-05-02");
  });

  it("rolls over month boundaries (28 days from late January)", () => {
    expect(addDaysToDateValue("2026-01-31", 7)).toBe("2026-02-07");
    expect(addDaysToDateValue("2026-01-15", 28)).toBe("2026-02-12");
  });

  it("rolls over year boundaries", () => {
    expect(addDaysToDateValue("2026-12-30", 7)).toBe("2027-01-06");
  });

  it("handles leap year February (2024)", () => {
    expect(addDaysToDateValue("2024-02-22", 7)).toBe("2024-02-29");
    expect(addDaysToDateValue("2024-02-29", 7)).toBe("2024-03-07");
  });

  it("handles non-leap year February (2026) without skipping a real day", () => {
    expect(addDaysToDateValue("2026-02-22", 7)).toBe("2026-03-01");
    expect(addDaysToDateValue("2026-02-28", 7)).toBe("2026-03-07");
  });

  it("accepts each +1~+4주 preset for the same starting date", () => {
    expect(addDaysToDateValue("2026-05-20", 7)).toBe("2026-05-27");
    expect(addDaysToDateValue("2026-05-20", 14)).toBe("2026-06-03");
    expect(addDaysToDateValue("2026-05-20", 21)).toBe("2026-06-10");
    expect(addDaysToDateValue("2026-05-20", 28)).toBe("2026-06-17");
  });

  it("returns null for invalid format inputs", () => {
    expect(addDaysToDateValue("2026/05/20", 7)).toBeNull();
    expect(addDaysToDateValue("2026-5-20", 7)).toBeNull();
    expect(addDaysToDateValue("", 7)).toBeNull();
    expect(addDaysToDateValue("abc", 7)).toBeNull();
  });
});
