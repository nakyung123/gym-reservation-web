// 두 좌표 사이의 거리(km)를 Haversine 공식으로 계산.
// 정확도는 ±0.5% 수준이라 도시 내 거리 비교/표시 용도로 충분.

import coordinates from "@/data/gym-coordinates.json";

export type GeoPoint = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// gymId → 좌표 lookup. 등록 안 된 체육관이면 null.
const COORDINATES = coordinates as Record<string, GeoPoint | undefined>;

export function getGymCoordinates(gymId: string): GeoPoint | null {
  return COORDINATES[gymId] ?? null;
}

// 사용자 위치 ↔ 체육관 거리(km). 좌표 없으면 null.
export function calculateGymDistanceKm(
  gymId: string,
  userLocation: GeoPoint | null,
): number | null {
  if (!userLocation) return null;
  const gymCoord = getGymCoordinates(gymId);
  if (!gymCoord) return null;
  return haversineKm(userLocation, gymCoord);
}

// 표시용 포매팅: 1.0km 미만은 m, 그 이상은 km 소수 첫째자리.
export function formatDistanceKm(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}
