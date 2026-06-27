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
    typeof gym.latitude === "number" &&
    Number.isFinite(gym.latitude) &&
    typeof gym.longitude === "number" &&
    Number.isFinite(gym.longitude) &&
    Array.isArray(gym.sports) &&
    gym.sports.every(isSport) &&
    isSportPriceMap(gym.sportPrices) &&
    isStringArray(gym.facilities) &&
    isStringArray(gym.availableTimes) &&
    isStringArray(gym.closedDays)
  );
}

// 실제 사진 파일이 있는 체육관(public/gyms/{slug}.webp).
//   현재 확보된 사진은 3장뿐이라, 사진이 없는 체육관에는 이 3장을 돌려 배정한다.
//   (사진을 추가하면 GYM_PHOTO_MAP에서 해당 id를 고유 파일로 바꾸면 된다.)
const GYM_PHOTO_FILES = [
  "jongno-culture-sports-center",
  "mapo-community-sports-center",
  "seongdong-community-sports-center",
];

// 체육관 id → 썸네일 파일 매핑. 자기 사진이 있는 3곳은 자기 것, 나머지는 3장을 순환 배정.
const GYM_PHOTO_MAP: Record<string, string> = {
  "jongno-culture-sports-center": "jongno-culture-sports-center",
  "seongdong-community-sports-center": "seongdong-community-sports-center",
  "mapo-community-sports-center": "mapo-community-sports-center",
  "seongbuk-community-sports-center": GYM_PHOTO_FILES[0],
  "sadang-sports-complex": GYM_PHOTO_FILES[1],
  "jayang-culture-sports-center": GYM_PHOTO_FILES[2],
  "geumcheon-culture-sports-center": GYM_PHOTO_FILES[0],
  "nowon-community-sports-center": GYM_PHOTO_FILES[1],
  "haegong-sports-culture-center": GYM_PHOTO_FILES[2],
  "iljasan-first-gym": GYM_PHOTO_FILES[0],
};

// 체육관 썸네일 경로. 매핑이 없으면 null(호출 측에서 placeholder를 렌더).
export function getGymThumbnail(gymId: string): string | null {
  const file = GYM_PHOTO_MAP[gymId];
  return file ? `/gyms/${file}.webp` : null;
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
