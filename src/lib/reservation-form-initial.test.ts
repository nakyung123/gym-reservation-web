import { describe, expect, it } from "vitest";
import {
  isInitialDateInWindow,
  resolveReservationFormInitial,
} from "@/lib/reservation-form-initial";
import type { Sport } from "@/types/domain";

const SAMPLE_GYM = {
  sports: ["배드민턴", "농구"] as Sport[],
  availableTimes: ["10:00", "11:00", "14:00"],
};

describe("resolveReservationFormInitial", () => {
  it("유효한 sport/time/date 쿼리는 그대로 반영한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: "농구",
        time: "11:00",
        date: "2026-06-15",
      }),
    ).toEqual({
      initialSport: "농구",
      initialTime: "11:00",
      initialSelectedDate: "2026-06-15",
    });
  });

  it("지원하지 않는 sport는 무시하고 gym.sports[0]을 사용한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: "풋살",
        time: null,
        date: null,
      }).initialSport,
    ).toBe("배드민턴");
  });

  it("sport 쿼리가 없으면 gym.sports[0]을 사용한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: null,
      }).initialSport,
    ).toBe("배드민턴");
  });

  it("availableTimes에 없는 time은 무시하고 availableTimes[0]을 사용한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: "13:00",
        date: null,
      }).initialTime,
    ).toBe("10:00");
  });

  it("time 쿼리가 없으면 availableTimes[0]을 사용한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: null,
      }).initialTime,
    ).toBe("10:00");
  });

  it("date 형식이 잘못되면 null을 반환한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: "2026/06/15",
      }).initialSelectedDate,
    ).toBeNull();
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: "abc",
      }).initialSelectedDate,
    ).toBeNull();
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: "",
      }).initialSelectedDate,
    ).toBeNull();
  });

  it("date 쿼리가 없으면 null을 반환한다", () => {
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: null,
      }).initialSelectedDate,
    ).toBeNull();
  });

  it("date 형식이 YYYY-MM-DD인 경우엔 윈도우 검증 없이 그대로 반환한다", () => {
    // 7일 윈도우 검증은 isInitialDateInWindow의 책임이며, 여기서는 형식만 본다.
    expect(
      resolveReservationFormInitial(SAMPLE_GYM, {
        sport: null,
        time: null,
        date: "2020-01-01",
      }).initialSelectedDate,
    ).toBe("2020-01-01");
  });
});

describe("isInitialDateInWindow", () => {
  const DATE_VALUES = ["2026-06-15", "2026-06-16", "2026-06-17"];

  it("initialSelectedDate가 null이면 검증 대상이 아니므로 true", () => {
    expect(isInitialDateInWindow(null, DATE_VALUES)).toBe(true);
    expect(isInitialDateInWindow(null, [])).toBe(true);
  });

  it("dateOptions에 포함되면 true", () => {
    expect(isInitialDateInWindow("2026-06-16", DATE_VALUES)).toBe(true);
  });

  it("dateOptions에 없으면 false (7일 윈도우 밖이라 안내 + today fallback 대상)", () => {
    expect(isInitialDateInWindow("2026-06-14", DATE_VALUES)).toBe(false);
    expect(isInitialDateInWindow("2026-06-22", DATE_VALUES)).toBe(false);
  });

  it("dateOptions가 비어 있으면 query date 유무에 따라 갈린다", () => {
    expect(isInitialDateInWindow(null, [])).toBe(true);
    expect(isInitialDateInWindow("2026-06-15", [])).toBe(false);
  });
});
