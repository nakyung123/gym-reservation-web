/**
 * 시설 찾기(/gyms) 목록의 "필터·정렬·페이지" 상태를 한곳에서 관리하는 리듀서.
 *
 * 지역·종목·체육관·정렬·즐겨찾기 필터가 서로 얽혀 있고("지역↔종목 cascade"),
 * 거의 모든 필터 변경이 "1페이지로 되돌리기"를 동반한다. 이 resetPage 규칙과
 * cascade 전이를 컴포넌트 핸들러마다 setState 조합으로 흩어 두면 한 곳만 빠뜨려도
 * "필터를 바꿨는데 빈 페이지가 보이는" 류의 버그가 나기 쉬워서 리듀서로 모은다.
 *
 * 부수효과(위치 권한 요청·알림 모달·상세 페이지 이동)는 리듀서에서 다루지 않는다.
 * 리듀서는 상태 전이만 담당하고, 컴포넌트가 부수효과를 오케스트레이션한다.
 * cascade 판정에 필요한 gyms 목록은 순수성을 지키기 위해 액션 페이로드로 받는다.
 */

import { SPORTS } from "@/lib/domain-constants";
import type { Gym, Sport } from "@/types/domain";

export type SportFilter = Sport | "전체";
export type RegionFilter = string | "전체";
// 정렬: 미적용(none) | 가까운 순(distance) | 가격순(price). 가격순은 asc/desc 토글.
// none은 버튼이 모두 꺼진 기본 상태로, 목록은 가격 오름차순으로 보여준다.
export type GymSort = "none" | "distance" | "price";
export type SortDir = "asc" | "desc";

export type GymFilterState = {
  region: RegionFilter;
  sport: SportFilter;
  // 검색바 마지막 단계(체육관 선택). 목록 필터에는 쓰이지 않고 '시설 검색' 이동에만 쓰인다.
  gymId: string;
  sort: GymSort;
  priceDir: SortDir;
  favoritesOnly: boolean;
  page: number;
  // 거리순 클릭 시 위치 권한이 없어 대기 중인 정렬 의도. location이 채워지면
  // 컴포넌트 effect가 LOCATION_RESOLVED로 자동 전환한다(재클릭 불필요).
  pendingSort: GymSort | null;
};

export type GymFilterAction =
  /** 지역 변경: 종목은 새 지역에서 가능하면 유지·불가하면 전체, 체육관 초기화, 1페이지. */
  | { type: "SET_REGION"; value: string; gyms: Gym[] }
  /** 종목 변경: 지역은 그 종목이 있으면 유지·없으면 전체, 체육관 초기화, 1페이지. */
  | { type: "SET_SPORT"; value: string; gyms: Gym[] }
  /** 메가메뉴 ?sport= 동기화: 종목만 맞추고 1페이지로(cascade·체육관 초기화 없음). */
  | { type: "SYNC_SPORT"; value: Sport }
  /** 체육관 선택: gymId만 설정(목록 필터가 아니므로 페이지 유지). */
  | { type: "SET_GYM_ID"; value: string }
  /** 페이지 이동(페이지네이션). */
  | { type: "SET_PAGE"; page: number }
  /** '시설 검색'에서 체육관 미선택: 현재 필터로 목록 조회 → 1페이지. */
  | { type: "SUBMIT_SEARCH" }
  /** 모든 필터 초기화(지역·종목 전체, 체육관·즐겨찾기 해제), 1페이지. */
  | { type: "CLEAR_FILTERS" }
  /** 즐겨찾기 필터 토글, 1페이지. */
  | { type: "TOGGLE_FAVORITES" }
  /** 즐겨찾기 필터 강제 해제(빈 상태 안내 버튼), 1페이지. */
  | { type: "CLEAR_FAVORITES" }
  /** 가까운 순 해제(다시 눌러 none으로), 1페이지. */
  | { type: "DISTANCE_OFF" }
  /** 가까운 순 적용(위치 보유), 1페이지. */
  | { type: "DISTANCE_ON" }
  /** 가까운 순 의도 보류(위치 요청 대기). 정렬 미적용이라 페이지 유지. */
  | { type: "DISTANCE_PENDING" }
  /** 위치 확보 후 보류했던 거리순으로 자동 전환(effect). 페이지는 유지한다. */
  | { type: "LOCATION_RESOLVED" }
  /** 보류했던 거리순 의도 취소(권한 차단 확인 시). */
  | { type: "CLEAR_PENDING_SORT" }
  /** 가격순 순환: 꺼짐→오름→내림→해제. 1페이지. */
  | { type: "PRICE_CLICK" };

// ?sport= 쿼리가 실제 종목인지 검증한다(SSOT=domain-constants SPORTS).
export function isValidSport(value: string | undefined): value is Sport {
  return !!value && (SPORTS as readonly string[]).includes(value);
}

// 종목이 특정 지역에서 (또는 지역 전체에서) 선택 가능한지. cascade 유지 판정 SSOT.
function sportAvailableInRegion(
  gyms: Gym[],
  region: RegionFilter,
  sport: Sport,
): boolean {
  return gyms.some(
    (gym) =>
      (region === "전체" || gym.region === region) &&
      gym.sports.includes(sport),
  );
}

export function createGymFilterInitialState(
  initialSport: Sport | null,
): GymFilterState {
  return {
    region: "전체",
    sport: initialSport ?? "전체",
    gymId: "",
    sort: "none",
    priceDir: "asc",
    favoritesOnly: false,
    page: 1,
    pendingSort: null,
  };
}

export function gymFilterReducer(
  state: GymFilterState,
  action: GymFilterAction,
): GymFilterState {
  switch (action.type) {
    case "SET_REGION": {
      // 종목은 새 지역에서도 가능하면 유지하고, 불가능할 때만 전체로 되돌린다.
      const sport =
        state.sport === "전체" ||
        sportAvailableInRegion(action.gyms, action.value, state.sport)
          ? state.sport
          : "전체";
      return {
        ...state,
        region: action.value,
        sport,
        gymId: "",
        page: 1,
      };
    }
    case "SET_SPORT": {
      const sport = action.value as SportFilter;
      // 지역은 그 종목이 있는 지역이면 유지하고, 없을 때만 전체로 되돌린다.
      const region =
        sport === "전체" ||
        state.region === "전체" ||
        sportAvailableInRegion(action.gyms, state.region, sport)
          ? state.region
          : "전체";
      return {
        ...state,
        sport,
        region,
        gymId: "",
        page: 1,
      };
    }
    case "SYNC_SPORT":
      return { ...state, sport: action.value, page: 1 };
    case "SET_GYM_ID":
      return { ...state, gymId: action.value };
    case "SET_PAGE":
      return { ...state, page: action.page };
    case "SUBMIT_SEARCH":
      return { ...state, page: 1 };
    case "CLEAR_FILTERS":
      return {
        ...state,
        region: "전체",
        sport: "전체",
        gymId: "",
        favoritesOnly: false,
        page: 1,
      };
    case "TOGGLE_FAVORITES":
      return { ...state, favoritesOnly: !state.favoritesOnly, page: 1 };
    case "CLEAR_FAVORITES":
      return { ...state, favoritesOnly: false, page: 1 };
    case "DISTANCE_OFF":
      return { ...state, sort: "none", pendingSort: null, page: 1 };
    case "DISTANCE_ON":
      return { ...state, sort: "distance", pendingSort: null, page: 1 };
    case "DISTANCE_PENDING":
      return { ...state, pendingSort: "distance" };
    case "LOCATION_RESOLVED":
      // 페이지 리셋 없음: 기존 동작 보존(거리순 클릭 시 이미 1페이지인 경우가 대부분).
      return { ...state, sort: "distance", pendingSort: null };
    case "CLEAR_PENDING_SORT":
      return { ...state, pendingSort: null };
    case "PRICE_CLICK": {
      // 꺼짐→오름차순→내림차순→해제(none) 순으로 순환. pendingSort는 항상 해제.
      if (state.sort === "price") {
        if (state.priceDir === "asc") {
          return { ...state, priceDir: "desc", pendingSort: null, page: 1 };
        }
        // 내림차순에서 한 번 더 → 해제. 다음 사용을 위해 방향은 오름차순으로 되돌린다.
        return {
          ...state,
          sort: "none",
          priceDir: "asc",
          pendingSort: null,
          page: 1,
        };
      }
      return {
        ...state,
        sort: "price",
        priceDir: "asc",
        pendingSort: null,
        page: 1,
      };
    }
    default:
      return state;
  }
}
