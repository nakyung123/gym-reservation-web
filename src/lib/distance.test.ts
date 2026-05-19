import { describe, expect, it } from "vitest";
import {
  calculateGymDistanceKm,
  formatDistanceKm,
  haversineKm,
  type GeoPoint,
} from "@/lib/distance";

const SEOUL_CITY_HALL: GeoPoint = { lat: 37.5665, lng: 126.978 };
const GANGNAM_STATION: GeoPoint = { lat: 37.4979, lng: 127.0276 };
const BUSAN_CITY_HALL: GeoPoint = { lat: 35.1796, lng: 129.0756 };

describe("haversineKm", () => {
  it("동일 좌표는 0을 반환한다", () => {
    expect(haversineKm(SEOUL_CITY_HALL, SEOUL_CITY_HALL)).toBe(0);
  });

  it("서울시청 ↔ 강남역은 약 8.6km로 계산한다", () => {
    // 실제 직선 거리는 약 8.6km. Haversine 정확도 ±0.5%
    expect(haversineKm(SEOUL_CITY_HALL, GANGNAM_STATION)).toBeCloseTo(8.6, 0);
  });

  it("서울시청 ↔ 부산시청은 약 325km로 계산한다", () => {
    expect(haversineKm(SEOUL_CITY_HALL, BUSAN_CITY_HALL)).toBeCloseTo(325, -1);
  });

  it("좌표 순서를 바꿔도 같은 거리를 반환한다 (대칭성)", () => {
    expect(haversineKm(SEOUL_CITY_HALL, GANGNAM_STATION)).toBe(
      haversineKm(GANGNAM_STATION, SEOUL_CITY_HALL),
    );
  });

  it("아주 가까운 좌표(약 100m)도 양수 값을 반환한다", () => {
    const near: GeoPoint = { lat: 37.5665, lng: 126.979 };
    const distance = haversineKm(SEOUL_CITY_HALL, near);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(0.2);
  });

  it("남반구/북반구를 가로지르는 좌표도 정상 처리한다", () => {
    const sydney: GeoPoint = { lat: -33.8688, lng: 151.2093 };
    // 서울 ↔ 시드니 약 8,300km
    expect(haversineKm(SEOUL_CITY_HALL, sydney)).toBeCloseTo(8300, -2);
  });

  it("지구 반대편(안티포드)은 약 π × 지구반지름(=20,015km)으로 계산한다", () => {
    const antipode: GeoPoint = { lat: -37.5665, lng: -53.022 };
    expect(haversineKm(SEOUL_CITY_HALL, antipode)).toBeCloseTo(20015, -2);
  });
});

describe("calculateGymDistanceKm", () => {
  const validGym = { latitude: GANGNAM_STATION.lat, longitude: GANGNAM_STATION.lng };

  it("사용자 위치가 있고 gym 좌표가 유효하면 haversineKm 결과를 반환한다", () => {
    expect(calculateGymDistanceKm(validGym, SEOUL_CITY_HALL)).toBe(
      haversineKm(SEOUL_CITY_HALL, GANGNAM_STATION),
    );
  });

  it("사용자 위치가 null이면 null을 반환한다", () => {
    expect(calculateGymDistanceKm(validGym, null)).toBeNull();
  });

  it("gym.latitude가 null이면 null을 반환한다", () => {
    expect(
      calculateGymDistanceKm(
        { latitude: null, longitude: GANGNAM_STATION.lng },
        SEOUL_CITY_HALL,
      ),
    ).toBeNull();
  });

  it("gym.longitude가 null이면 null을 반환한다", () => {
    expect(
      calculateGymDistanceKm(
        { latitude: GANGNAM_STATION.lat, longitude: null },
        SEOUL_CITY_HALL,
      ),
    ).toBeNull();
  });

  it("gym 좌표가 undefined이면 null을 반환한다", () => {
    expect(
      calculateGymDistanceKm(
        { latitude: undefined, longitude: undefined },
        SEOUL_CITY_HALL,
      ),
    ).toBeNull();
  });

  it("gym 좌표가 NaN이면 null을 반환한다", () => {
    expect(
      calculateGymDistanceKm(
        { latitude: Number.NaN, longitude: GANGNAM_STATION.lng },
        SEOUL_CITY_HALL,
      ),
    ).toBeNull();
  });

  it("gym 좌표가 Infinity이면 null을 반환한다", () => {
    expect(
      calculateGymDistanceKm(
        { latitude: Number.POSITIVE_INFINITY, longitude: GANGNAM_STATION.lng },
        SEOUL_CITY_HALL,
      ),
    ).toBeNull();
  });
});

describe("formatDistanceKm", () => {
  it("1km 미만은 m 단위로 표시한다", () => {
    expect(formatDistanceKm(0.5)).toBe("500m");
  });

  it("0km는 0m로 표시한다", () => {
    expect(formatDistanceKm(0)).toBe("0m");
  });

  it("0.999km는 m 단위로 반올림해 999m로 표시한다", () => {
    expect(formatDistanceKm(0.999)).toBe("999m");
  });

  it("정확히 1km는 km 단위 소수 첫째자리로 표시한다", () => {
    expect(formatDistanceKm(1)).toBe("1.0km");
  });

  it("1km 이상은 km 단위 소수 첫째자리로 반올림해 표시한다", () => {
    expect(formatDistanceKm(1.55)).toBe("1.6km");
    expect(formatDistanceKm(12.34)).toBe("12.3km");
  });

  it("아주 작은 거리도 m 단위로 반올림한다", () => {
    expect(formatDistanceKm(0.0005)).toBe("1m");
  });
});
