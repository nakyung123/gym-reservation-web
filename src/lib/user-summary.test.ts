import { describe, expect, it } from "vitest";
import {
  addReservationStatusCount,
  createEmptyUserReservationSummary,
  isUserSummary,
} from "@/lib/user-summary";

describe("isUserSummary", () => {
  it("내 정보 요약 응답 형식을 검증한다", () => {
    expect(
      isUserSummary({
        userId: "user-a",
        reservations: {
          total: 1,
          reserved: 1,
          cancelled: 0,
          used: 0,
        },
        favorites: {
          activeGymCount: 2,
        },
      }),
    ).toBe(true);

    expect(
      isUserSummary({
        userId: "user-a",
        reservations: {
          total: "1",
          reserved: 1,
          cancelled: 0,
          used: 0,
        },
        favorites: {
          activeGymCount: 2,
        },
      }),
    ).toBe(false);
  });
});

describe("addReservationStatusCount", () => {
  it("상태별 예약 수와 전체 예약 수를 더한다", () => {
    const summary = createEmptyUserReservationSummary();

    addReservationStatusCount(summary, "reserved", 2);
    addReservationStatusCount(summary, "cancelled", 1);

    expect(summary).toEqual({
      total: 3,
      reserved: 2,
      cancelled: 1,
      used: 0,
    });
  });

  it("알 수 없는 예약 상태면 예외를 던진다", () => {
    const summary = createEmptyUserReservationSummary();

    expect(() => addReservationStatusCount(summary, "pending", 1)).toThrow(
      "알 수 없는 예약 상태입니다: pending",
    );
  });
});
