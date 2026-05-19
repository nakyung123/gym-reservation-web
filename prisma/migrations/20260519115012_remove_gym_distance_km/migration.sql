-- Gym.distanceKm 폐기. 사용자 표시 거리 계산은 latitude/longitude 기반으로 통합됨.
ALTER TABLE "gyms" DROP COLUMN "distance_km";
