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
        reservationCountByGym: { "gym-a": 1 },
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
        reservationCountByGym: {},
      }),
    ).toBe(false);
  });

  it("시설별 예약 횟수가 없거나 형식이 틀리면 거부한다", () => {
    const base = {
      userId: "user-a",
      reservations: { total: 0, reserved: 0, cancelled: 0, used: 0 },
      favorites: { activeGymCount: 0 },
    };

    // 필드 누락은 거부한다(조용히 빈 값으로 넘기면 예약 횟수가 0으로 잘못 보인다).
    expect(isUserSummary(base)).toBe(false);
    expect(isUserSummary({ ...base, reservationCountByGym: {} })).toBe(true);
    expect(
      isUserSummary({ ...base, reservationCountByGym: { "gym-a": -1 } }),
    ).toBe(false);
    expect(
      isUserSummary({ ...base, reservationCountByGym: { "gym-a": "2" } }),
    ).toBe(false);
    // 배열은 객체지만 시설별 맵이 아니다.
    expect(isUserSummary({ ...base, reservationCountByGym: [] })).toBe(false);
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
