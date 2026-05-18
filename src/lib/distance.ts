// 두 좌표 사이의 거리(km)를 Haversine 공식으로 계산.
// 정확도는 ±0.5% 수준이라 도시 내 거리 비교/표시 용도로 충분.
//
// 체육관 좌표 SSOT는 Gym 모델의 latitude/longitude이다 (DB → mapper → Gym 객체).
// 별도 JSON으로 좌표를 관리하지 않는다.

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

// Gym(또는 좌표만 든 부분 객체) ↔ 사용자 좌표 거리(km).
// gym.latitude/longitude가 유효한 숫자가 아니거나 userLocation이 null이면 null.
export function calculateGymDistanceKm(
  gym: { latitude: number | null | undefined; longitude: number | null | undefined },
  userLocation: GeoPoint | null,
): number | null {
  if (!userLocation) return null;
  if (
    typeof gym.latitude !== "number" ||
    !Number.isFinite(gym.latitude) ||
    typeof gym.longitude !== "number" ||
    !Number.isFinite(gym.longitude)
  ) {
    return null;
  }
  return haversineKm(userLocation, { lat: gym.latitude, lng: gym.longitude });
}

// 표시용 포매팅: 1.0km 미만은 m, 그 이상은 km 소수 첫째자리.
export function formatDistanceKm(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}
