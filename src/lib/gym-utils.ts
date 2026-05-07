import type { Gym, Sport } from "@/types/domain";

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
