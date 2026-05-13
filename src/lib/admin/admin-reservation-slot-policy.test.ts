import { describe, expect, it } from "vitest";
import {
  ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT,
  addAdminBulkSlotDate,
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
