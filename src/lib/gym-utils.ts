import { isSport } from "@/lib/domain-constants";
import type { Gym, Sport } from "@/types/domain";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSportPriceMap(
  value: unknown,
): value is Partial<Record<Sport, number>> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([sport, price]) =>
        isSport(sport) && typeof price === "number" && Number.isFinite(price),
    )
  );
}

export function isGym(value: unknown): value is Gym {
  if (!value || typeof value !== "object") {
    return false;
  }

  const gym = value as Partial<Gym>;

  return (
    typeof gym.id === "string" &&
    typeof gym.name === "string" &&
    typeof gym.region === "string" &&
    typeof gym.address === "string" &&
    typeof gym.officialUrl === "string" &&
    typeof gym.openHours === "string" &&
    typeof gym.basePrice === "number" &&
    Number.isFinite(gym.basePrice) &&
    typeof gym.description === "string" &&
    typeof gym.distanceKm === "number" &&
    Number.isFinite(gym.distanceKm) &&
    Array.isArray(gym.sports) &&
    gym.sports.every(isSport) &&
    isSportPriceMap(gym.sportPrices) &&
    isStringArray(gym.facilities) &&
    isStringArray(gym.availableTimes) &&
    isStringArray(gym.closedDays)
  );
}

export function getGymSportPrice(gym: Gym, sport: Sport) {
  return gym.sportPrices[sport] ?? gym.basePrice;
}

export function getGymLowestPrice(gym: Gym) {
  const prices = gym.sports
    .map((sport) => getGymSportPrice(gym, sport))
    .filter((price) => Number.isFinite(price));

  return prices.length > 0 ? Math.min(...prices) : gym.basePrice;
}

export function formatGymPrice(price: number) {
  return `${price.toLocaleString()}원`;
}

export function getAvailableSports(gyms: Gym[]) {
  const sports = new Set<Sport>();

  gyms.forEach((gym) => {
    gym.sports.forEach((sport) => sports.add(sport));
  });

  return Array.from(sports);
}

export function getAvailableRegions(gyms: Gym[]) {
  const regions = new Set<string>();

  gyms.forEach((gym) => {
    regions.add(gym.region);
  });

  return Array.from(regions).sort((left, right) =>
    left.localeCompare(right, "ko"),
  );
}

export function getGymSearchText(gym: Gym) {
  return [
    gym.name,
    gym.region,
    gym.address,
    gym.description,
    gym.openHours,
    ...gym.sports,
    ...gym.facilities,
  ]
    .join(" ")
    .toLowerCase();
}
