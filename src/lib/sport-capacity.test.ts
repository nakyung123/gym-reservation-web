import { describe, expect, it } from "vitest";
import {
  SPORT_MAX_PEOPLE,
  clampPeople,
  computeReservationPrice,
  isValidPeople,
} from "@/lib/sport-capacity";
import type { Gym } from "@/types/domain";

const gym = {
  basePrice: 10000,
  sportPrices: { 배드민턴: 12000, 배구: 5000 },
} as Gym;

describe("clampPeople", () => {
  it("미전송(undefined)은 1로 취급한다", () => {
    expect(clampPeople("배드민턴", undefined)).toBe(1);
  });

  it("하한 1 미만은 1로 보정한다", () => {
    expect(clampPeople("배드민턴", 0)).toBe(1);
    expect(clampPeople("배드민턴", -3)).toBe(1);
  });

  it("정원 초과는 정원으로 보정한다", () => {
    expect(clampPeople("배드민턴", 99)).toBe(SPORT_MAX_PEOPLE.배드민턴);
    expect(clampPeople("배구", 99)).toBe(SPORT_MAX_PEOPLE.배구);
  });

  it("소수는 내림한다", () => {
    expect(clampPeople("농구", 3.9)).toBe(3);
  });

  it("NaN·Infinity 같은 비유한값은 1로 폴백한다", () => {
    expect(clampPeople("배드민턴", Number.NaN)).toBe(1);
    expect(clampPeople("배드민턴", Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("isValidPeople", () => {
  it("미전송(undefined)은 유효(1 취급)", () => {
    expect(isValidPeople("배드민턴", undefined)).toBe(true);
  });

  it("범위 내 정수는 유효", () => {
    expect(isValidPeople("배드민턴", 1)).toBe(true);
    expect(isValidPeople("배드민턴", 4)).toBe(true);
  });

  it("범위 밖·0·소수·음수는 무효", () => {
    expect(isValidPeople("배드민턴", 0)).toBe(false);
    expect(isValidPeople("배드민턴", 5)).toBe(false);
    expect(isValidPeople("배드민턴", 2.5)).toBe(false);
    expect(isValidPeople("배드민턴", -1)).toBe(false);
  });
});

describe("computeReservationPrice", () => {
  it("단가 × clamp(인원)으로 합산한다", () => {
    expect(computeReservationPrice(gym, "배드민턴", 3)).toBe(36000);
  });

  it("미전송이면 단가 × 1", () => {
    expect(computeReservationPrice(gym, "배드민턴", undefined)).toBe(12000);
  });

  it("정원 초과 인원은 정원으로 clamp 후 합산한다", () => {
    expect(computeReservationPrice(gym, "배드민턴", 99)).toBe(
      12000 * SPORT_MAX_PEOPLE.배드민턴,
    );
  });

  it("sportPrices에 없는 종목은 basePrice를 단가로 쓴다", () => {
    // 농구는 위 gym.sportPrices에 없음 → basePrice 10000
    expect(computeReservationPrice(gym, "농구", 2)).toBe(20000);
  });
});
