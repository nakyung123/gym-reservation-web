import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ADMIN_GYM_SPORTS } from "@/lib/admin/admin-gym-schema";
import {
  toAdminGym,
  toDomainGym,
  type GymRowWithSports,
} from "@/lib/server/mysql-gym-mapper";

const firstSport = ADMIN_GYM_SPORTS[0];
const secondSport = ADMIN_GYM_SPORTS[1];

function createRow(
  overrides: Partial<GymRowWithSports> = {},
): GymRowWithSports {
  return {
    id: "mapper-gym",
    name: "Mapper Gym",
    region: "Mapper Region",
    address: "1 Mapper Road",
    officialUrl: "https://example.com/mapper-gym",
    openHours: "09:00-18:00",
    basePrice: 10000,
    description: "Mapper test gym",
    distanceKm: new Prisma.Decimal("1.25"),
    latitude: 37.5665,
    longitude: 126.978,
    sportPrices: {
      [firstSport]: 10000,
      [secondSport]: 12000,
    },
    facilities: ["locker", "shower"],
    availableTimes: ["10:00", "11:00"],
    closedDays: ["MON"],
    isActive: true,
    sports: [
      { gymId: "mapper-gym", sport: secondSport },
      { gymId: "mapper-gym", sport: firstSport },
    ],
    ...overrides,
  };
}

describe("mysql gym mapper", () => {
  it("maps a MySQL gym row to a public domain gym", () => {
    const gym = toDomainGym(createRow());

    expect(gym).toEqual({
      id: "mapper-gym",
      name: "Mapper Gym",
      region: "Mapper Region",
      address: "1 Mapper Road",
      officialUrl: "https://example.com/mapper-gym",
      openHours: "09:00-18:00",
      basePrice: 10000,
      description: "Mapper test gym",
      distanceKm: 1.25,
      latitude: 37.5665,
      longitude: 126.978,
      sportPrices: {
        [firstSport]: 10000,
        [secondSport]: 12000,
      },
      sports: [firstSport, secondSport],
      facilities: ["locker", "shower"],
      availableTimes: ["10:00", "11:00"],
      closedDays: ["MON"],
    });
  });

  it("preserves the admin active flag", () => {
    expect(toAdminGym(createRow({ isActive: false }))).toMatchObject({
      id: "mapper-gym",
      isActive: false,
    });
  });

  it("rejects malformed sport prices", () => {
    expect(() =>
      toDomainGym(
        createRow({
          sportPrices: { [firstSport]: "10000" } as unknown as Prisma.JsonValue,
        }),
      ),
    ).toThrow();
  });

  it("rejects malformed array fields", () => {
    expect(() =>
      toDomainGym(
        createRow({
          facilities: ["locker", 1] as unknown as Prisma.JsonValue,
        }),
      ),
    ).toThrow();
  });

  it("rejects unsupported sports from the relation table", () => {
    expect(() =>
      toDomainGym(
        createRow({
          sports: [{ gymId: "mapper-gym", sport: "baseball" }],
        }),
      ),
    ).toThrow();
  });
});
