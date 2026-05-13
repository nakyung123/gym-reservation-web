import { describe, expect, it } from "vitest";
import {
  ADMIN_GYM_SPORTS,
  isAdminGym,
  validateAdminGymPayload,
} from "@/lib/admin/admin-gym-schema";
import type { AdminGym } from "@/types/domain";

const primarySport = ADMIN_GYM_SPORTS[0];
const secondarySport = ADMIN_GYM_SPORTS[1];

const validPayload: AdminGym = {
  id: "schema-test-gym",
  name: "스키마 테스트 체육관",
  region: "서울 테스트구",
  address: "테스트로 1",
  officialUrl: "https://example.com/gym",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "관리자 체육관 스키마 검증용 데이터입니다.",
  distanceKm: 1.25,
  sports: [primarySport, secondarySport],
  sportPrices: {
    [primarySport]: 12000,
    [secondarySport]: 15000,
  },
  facilities: ["샤워실", "주차장"],
  availableTimes: ["10:00", "11:00"],
  closedDays: [],
  isActive: true,
};

describe("validateAdminGymPayload", () => {
  it("validates a create payload and normalizes text, arrays, and distance", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        id: " schema-test-gym ",
        name: "  스키마 테스트 체육관  ",
        distanceKm: 1.256,
        sports: [primarySport, primarySport, secondarySport],
        facilities: ["샤워실", "샤워실", "주차장"],
        availableTimes: ["11:00", "10:00", "10:00"],
      },
      { requireId: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toMatchObject({
      id: "schema-test-gym",
      name: "스키마 테스트 체육관",
      distanceKm: 1.26,
      sports: [primarySport, secondarySport],
      facilities: ["샤워실", "주차장"],
      availableTimes: ["10:00", "11:00"],
    });
  });

  it("validates an update payload without requiring an id", () => {
    const result = validateAdminGymPayload(validPayload, { requireId: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("id" in result.input).toBe(false);
    expect(result.input.name).toBe(validPayload.name);
  });

  it("rejects unsupported sports", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        sports: ["야구"],
        sportPrices: { 야구: 10000 },
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("지원하지 않는 종목입니다");
  });

  it("rejects invalid gym ids when creating a gym", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        id: "Schema Test Gym",
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("시설 ID");
  });

  it("rejects non-http official URLs", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        officialUrl: "ftp://example.com/gym",
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("공식 URL은 http 또는 https 주소여야 합니다.");
  });

  it("rejects missing sport prices for selected sports", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        sportPrices: {
          [primarySport]: 12000,
        },
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(`${secondarySport} 이용료`);
  });

  it("rejects invalid available time values", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        availableTimes: ["10:00", "24:00"],
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("HH:mm");
  });

  it("rejects payloads without a boolean isActive", () => {
    const result = validateAdminGymPayload(
      {
        ...validPayload,
        isActive: "true",
      },
      { requireId: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("운영 상태는 boolean이어야 합니다.");
  });
});

describe("isAdminGym", () => {
  it("checks whether a value has the admin gym response shape", () => {
    expect(isAdminGym(validPayload)).toBe(true);
    expect(isAdminGym({ ...validPayload, isActive: "true" })).toBe(false);
  });
});
