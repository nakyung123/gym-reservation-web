import { describe, expect, it } from "vitest";
import {
  createGymFilterInitialState,
  gymFilterReducer,
  isValidSport,
  type GymFilterState,
} from "@/components/gym/gym-filters-reducer";
import type { Gym, Sport } from "@/types/domain";

// 리듀서는 gym.region / gym.sports만 참조한다. 나머지 필드는 형식만 채운 픽스처.
function gym(region: string, sports: Sport[]): Gym {
  return {
    id: `${region}-${sports.join("")}`,
    name: `${region} 체육관`,
    region,
    address: "",
    officialUrl: "",
    openHours: "",
    basePrice: 0,
    sports,
    sportPrices: {},
    facilities: [],
    availableTimes: [],
    closedDays: [],
    latitude: 0,
    longitude: 0,
    description: "",
  };
}

// 강남=배드민턴, 송파=농구. 종목↔지역 cascade 판정을 검증할 최소 데이터.
const GYMS: Gym[] = [
  gym("강남구", ["배드민턴"]),
  gym("송파구", ["농구"]),
];

const base = (over: Partial<GymFilterState> = {}): GymFilterState => ({
  ...createGymFilterInitialState(null),
  ...over,
});

describe("createGymFilterInitialState", () => {
  it("initialSport 없으면 전체·1페이지·none 기본값", () => {
    expect(createGymFilterInitialState(null)).toEqual({
      region: "전체",
      sport: "전체",
      gymId: "",
      sort: "none",
      priceDir: "asc",
      favoritesOnly: false,
      page: 1,
      pendingSort: null,
    });
  });

  it("딥링크 종목은 초기 sport로 반영", () => {
    expect(createGymFilterInitialState("농구").sport).toBe("농구");
  });
});

describe("isValidSport", () => {
  it("SPORTS에 있는 값만 통과", () => {
    expect(isValidSport("농구")).toBe(true);
    expect(isValidSport("수영")).toBe(false);
    expect(isValidSport(undefined)).toBe(false);
  });
});

describe("SET_REGION cascade", () => {
  it("종목이 새 지역에 있으면 유지·gymId 초기화·1페이지", () => {
    const next = gymFilterReducer(
      base({ sport: "배드민턴", gymId: "g1", page: 3 }),
      { type: "SET_REGION", value: "강남구", gyms: GYMS },
    );
    expect(next.region).toBe("강남구");
    expect(next.sport).toBe("배드민턴"); // 강남에 배드민턴 있음 → 유지
    expect(next.gymId).toBe("");
    expect(next.page).toBe(1);
  });

  it("종목이 새 지역에 없으면 전체로 되돌림", () => {
    const next = gymFilterReducer(base({ sport: "배드민턴" }), {
      type: "SET_REGION",
      value: "송파구",
      gyms: GYMS,
    });
    expect(next.region).toBe("송파구");
    expect(next.sport).toBe("전체"); // 송파엔 배드민턴 없음 → 전체
  });

  it("종목이 전체면 그대로 전체", () => {
    const next = gymFilterReducer(base({ sport: "전체" }), {
      type: "SET_REGION",
      value: "송파구",
      gyms: GYMS,
    });
    expect(next.sport).toBe("전체");
  });
});

describe("SET_SPORT cascade", () => {
  it("지역에 그 종목이 있으면 지역 유지·gymId 초기화·1페이지", () => {
    const next = gymFilterReducer(
      base({ region: "강남구", gymId: "g1", page: 2 }),
      { type: "SET_SPORT", value: "배드민턴", gyms: GYMS },
    );
    expect(next.sport).toBe("배드민턴");
    expect(next.region).toBe("강남구"); // 강남에 배드민턴 있음 → 유지
    expect(next.gymId).toBe("");
    expect(next.page).toBe(1);
  });

  it("지역에 그 종목이 없으면 지역 전체로 되돌림", () => {
    const next = gymFilterReducer(base({ region: "강남구" }), {
      type: "SET_SPORT",
      value: "농구",
      gyms: GYMS,
    });
    expect(next.sport).toBe("농구");
    expect(next.region).toBe("전체"); // 강남엔 농구 없음 → 전체
  });

  it("종목 전체 선택이면 지역 유지", () => {
    const next = gymFilterReducer(base({ region: "강남구" }), {
      type: "SET_SPORT",
      value: "전체",
      gyms: GYMS,
    });
    expect(next.region).toBe("강남구");
  });
});

describe("SYNC_SPORT", () => {
  it("종목만 맞추고 1페이지로, gymId는 건드리지 않음", () => {
    const next = gymFilterReducer(base({ gymId: "g1", page: 4 }), {
      type: "SYNC_SPORT",
      value: "농구",
    });
    expect(next.sport).toBe("농구");
    expect(next.page).toBe(1);
    expect(next.gymId).toBe("g1");
  });
});

describe("gymId·page", () => {
  it("SET_GYM_ID는 gymId만 바꾸고 페이지는 유지", () => {
    const next = gymFilterReducer(base({ page: 3 }), {
      type: "SET_GYM_ID",
      value: "g9",
    });
    expect(next.gymId).toBe("g9");
    expect(next.page).toBe(3);
  });

  it("SET_PAGE는 페이지만 이동", () => {
    expect(gymFilterReducer(base(), { type: "SET_PAGE", page: 5 }).page).toBe(5);
  });

  it("SUBMIT_SEARCH는 1페이지로", () => {
    expect(
      gymFilterReducer(base({ page: 7 }), { type: "SUBMIT_SEARCH" }).page,
    ).toBe(1);
  });
});

describe("favorites·clear", () => {
  it("TOGGLE_FAVORITES 토글 + 1페이지", () => {
    const on = gymFilterReducer(base({ page: 3 }), {
      type: "TOGGLE_FAVORITES",
    });
    expect(on.favoritesOnly).toBe(true);
    expect(on.page).toBe(1);
    expect(gymFilterReducer(on, { type: "TOGGLE_FAVORITES" }).favoritesOnly).toBe(
      false,
    );
  });

  it("CLEAR_FAVORITES는 항상 해제 + 1페이지", () => {
    const next = gymFilterReducer(
      base({ favoritesOnly: true, page: 2 }),
      { type: "CLEAR_FAVORITES" },
    );
    expect(next.favoritesOnly).toBe(false);
    expect(next.page).toBe(1);
  });

  it("CLEAR_FILTERS는 지역·종목·gymId·즐겨찾기 초기화 + 1페이지 (정렬은 유지)", () => {
    const next = gymFilterReducer(
      base({
        region: "강남구",
        sport: "배드민턴",
        gymId: "g1",
        favoritesOnly: true,
        sort: "price",
        priceDir: "desc",
        page: 4,
      }),
      { type: "CLEAR_FILTERS" },
    );
    expect(next).toMatchObject({
      region: "전체",
      sport: "전체",
      gymId: "",
      favoritesOnly: false,
      page: 1,
      sort: "price", // 정렬은 CLEAR_FILTERS 대상 아님(기존 동작)
      priceDir: "desc",
    });
  });
});

describe("distance sort", () => {
  it("DISTANCE_ON: 거리순 + pendingSort 해제 + 1페이지", () => {
    const next = gymFilterReducer(base({ page: 2, pendingSort: "distance" }), {
      type: "DISTANCE_ON",
    });
    expect(next.sort).toBe("distance");
    expect(next.pendingSort).toBeNull();
    expect(next.page).toBe(1);
  });

  it("DISTANCE_OFF: none으로 + 1페이지", () => {
    const next = gymFilterReducer(base({ sort: "distance", page: 3 }), {
      type: "DISTANCE_OFF",
    });
    expect(next.sort).toBe("none");
    expect(next.page).toBe(1);
  });

  it("DISTANCE_PENDING: 의도만 기록, 정렬·페이지 불변", () => {
    const next = gymFilterReducer(base({ page: 3 }), {
      type: "DISTANCE_PENDING",
    });
    expect(next.pendingSort).toBe("distance");
    expect(next.sort).toBe("none");
    expect(next.page).toBe(3);
  });

  it("LOCATION_RESOLVED: 거리순 전환하되 페이지는 보존(기존 동작)", () => {
    const next = gymFilterReducer(base({ pendingSort: "distance", page: 5 }), {
      type: "LOCATION_RESOLVED",
    });
    expect(next.sort).toBe("distance");
    expect(next.pendingSort).toBeNull();
    expect(next.page).toBe(5);
  });

  it("CLEAR_PENDING_SORT: 보류 의도만 취소", () => {
    const next = gymFilterReducer(base({ pendingSort: "distance", sort: "none" }), {
      type: "CLEAR_PENDING_SORT",
    });
    expect(next.pendingSort).toBeNull();
    expect(next.sort).toBe("none");
  });
});

describe("PRICE_CLICK 순환", () => {
  it("none → price asc → price desc → none", () => {
    const s1 = gymFilterReducer(base(), { type: "PRICE_CLICK" });
    expect(s1).toMatchObject({ sort: "price", priceDir: "asc", page: 1 });

    const s2 = gymFilterReducer(s1, { type: "PRICE_CLICK" });
    expect(s2).toMatchObject({ sort: "price", priceDir: "desc" });

    const s3 = gymFilterReducer(s2, { type: "PRICE_CLICK" });
    // 해제 시 방향은 다음 사용을 위해 asc로 되돌림.
    expect(s3).toMatchObject({ sort: "none", priceDir: "asc" });
  });

  it("거리순에서 가격순 클릭 시 pendingSort 해제 + 가격 오름차순", () => {
    const next = gymFilterReducer(
      base({ sort: "distance", pendingSort: "distance" }),
      { type: "PRICE_CLICK" },
    );
    expect(next).toMatchObject({
      sort: "price",
      priceDir: "asc",
      pendingSort: null,
    });
  });
});
