"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/app-button";
import { AlertModal } from "@/components/ui/alert-modal";
import { GymCard } from "@/components/gym/gym-card";
import { SelectMenu } from "@/components/ui/select-menu";
import { BoardPagination } from "@/components/ui/board-pagination";
import {
  createGymFilterInitialState,
  gymFilterReducer,
  isValidSport,
  type GymSort,
  type SortDir,
} from "@/components/gym/gym-filters-reducer";
import { useFavorites } from "@/hooks/use-favorites";
import { useUserLocation } from "@/hooks/use-user-location";
import { useBoardPaginationLabels } from "@/hooks/use-board-pagination-labels";
import { usePagination } from "@/hooks/use-pagination";
import { calculateGymDistanceKm } from "@/lib/distance";
import { SPORTS } from "@/lib/domain-constants";
import { getAvailableRegions, getGymLowestPrice } from "@/lib/gym-utils";
import type { GeoPoint } from "@/lib/distance";
import type { Gym, Sport } from "@/types/domain";

type GymDiscoveryProps = {
  gyms: Gym[];
  // 메가메뉴 '종목별'에서 넘어온 ?sport=<종목> (gyms/page에서 전달).
  initialSport?: string;
};

// 페이지당 카드 수(시설 찾기 목록).
const PER_PAGE = 9;

// 검색바 드롭다운 공통 컨트롤 룩(홈 검색바 FIELD_TRIGGER_CLASS와 동일: 높이·radius·보더·disabled 톤).
const CONTROL_CLASS =
  "h-12 rounded-[10px] border border-line-strong bg-white px-3.5 text-[15px] transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2";
const FIELD_LABEL_CLASS = "text-[12.5px] font-bold text-foreground";

function distanceForSort(gym: Gym, location: GeoPoint | null): number {
  const km = calculateGymDistanceKm(gym, location);
  return km ?? Number.POSITIVE_INFINITY;
}

function sortGyms(
  gyms: Gym[],
  sort: GymSort,
  dir: SortDir,
  location: GeoPoint | null,
) {
  return [...gyms].sort((left, right) => {
    // none: 기본 정렬(가격 오름차순). price와 같은 규칙이되 방향 토글은 없다.
    if (sort === "price" || sort === "none") {
      const diff = getGymLowestPrice(left) - getGymLowestPrice(right);
      const signed = sort === "none" ? diff : dir === "desc" ? -diff : diff;
      // 오름차순(낮은→높은)이 기본, 다시 누르면 내림차순. 동가는 이름순 tiebreak.
      return signed || left.name.localeCompare(right.name);
    }

    // 가까운 순. 위치 없으면 거리 비교가 불가능하므로 이름순으로 폴백.
    if (!location) {
      return left.name.localeCompare(right.name);
    }
    return (
      distanceForSort(left, location) - distanceForSort(right, location) ||
      left.name.localeCompare(right.name)
    );
  });
}

// 가격순 방향 표시 화살표(오름=위, 내림=아래).
function SortDirArrow({ dir }: { dir: SortDir }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5"
    >
      <path d={dir === "asc" ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"} />
    </svg>
  );
}

// 즐겨찾기 별. 색은 버튼 currentColor를 따른다(필터 버튼은 대표색=accent).
// 선택 시 채워진 별, 비선택 시 윤곽선.
function FavoriteStar({ className, filled }: { className: string; filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .32-.988l5.519-.442a.562.562 0 0 0 .475-.345L11.48 3.5z" />
    </svg>
  );
}

export function GymDiscovery({ gyms, initialSport }: GymDiscoveryProps) {
  const t = useTranslations("Gyms");
  const paginationLabels = useBoardPaginationLabels();
  const router = useRouter();
  // 필터·정렬·페이지 상태는 gym-filters-reducer가 SSOT. resetPage/cascade 전이를
  // 리듀서에 모아 "필터가 바뀌면 1페이지로" 불변식을 한곳에서 보장한다.
  const [filters, dispatch] = useReducer(
    gymFilterReducer,
    isValidSport(initialSport) ? initialSport : null,
    createGymFilterInitialState,
  );
  const {
    region: selectedRegion,
    sport: selectedSport,
    gymId: selectedGymId,
    sort: selectedSort,
    priceDir,
    favoritesOnly,
    page,
    pendingSort,
  } = filters;
  // 알림 모달 2종은 순수 UI transient(필터 상태 아님)라 컴포넌트 로컬 상태로 둔다.
  // 위치 권한이 차단되어 가까운 순을 못 쓸 때, 그리고 즐겨찾기가 없을 때 각각 띄운다.
  const [locationDeniedAlert, setLocationDeniedAlert] = useState(false);
  const [favoritesEmptyAlert, setFavoritesEmptyAlert] = useState(false);
  const { favorites, toggleFavorite, isFavorite, toggleError, loadError } = useFavorites();
  const { location, permission, requestLocation } = useUserLocation();

  // 거리순 의도를 보류(pendingSort=distance)한 뒤 위치가 채워지면 자동으로 거리순 전환.
  useEffect(() => {
    if (!location || pendingSort !== "distance") return;
    dispatch({ type: "LOCATION_RESOLVED" });
  }, [location, pendingSort]);

  // 가까운 순 의도가 있는데 위치 권한이 차단(denied)됐고 좌표가 없으면(네이티브 팝업 거부 포함)
  // 통일 알림창을 띄우고 보류 의도는 해제한다.
  useEffect(() => {
    if (pendingSort === "distance" && permission === "denied" && !location) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocationDeniedAlert(true);
      dispatch({ type: "CLEAR_PENDING_SORT" });
    }
  }, [pendingSort, permission, location]);

  // 메가메뉴 '종목별'에서 ?sport=가 바뀌어 들어오면(이미 /gyms에 있을 때 포함)
  // 종목 필터를 동기화하고 1페이지로 되돌린다.
  useEffect(() => {
    if (isValidSport(initialSport)) {
      dispatch({ type: "SYNC_SPORT", value: initialSport });
    }
  }, [initialSport]);

  // 지역 옵션: 선택한 종목이 있는 지역만(종목→지역 방향 cascade). 종목이 전체면 전 지역.
  const availableRegions = useMemo(() => {
    const scoped =
      selectedSport === "전체"
        ? gyms
        : gyms.filter((gym) => gym.sports.includes(selectedSport));
    return getAvailableRegions(scoped);
  }, [gyms, selectedSport]);

  // 종목: 선택한 지역의 체육관이 가진 종목만(홈 검색바와 동일, 도메인 표준 순서 SPORTS).
  const sportOptions = useMemo(() => {
    const available = new Set<Sport>();
    for (const gym of gyms) {
      if (selectedRegion !== "전체" && gym.region !== selectedRegion) continue;
      for (const item of gym.sports) available.add(item);
    }
    return SPORTS.filter((item) => available.has(item));
  }, [gyms, selectedRegion]);

  // 체육관: 선택한 지역 + 종목에 맞는 목록(이름순). 검색바 마지막 단계 선택지.
  const gymOptions = useMemo(() => {
    return gyms
      .filter(
        (gym) =>
          (selectedRegion === "전체" || gym.region === selectedRegion) &&
          (selectedSport === "전체" || gym.sports.includes(selectedSport)),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  }, [gyms, selectedRegion, selectedSport]);

  const filteredGyms = useMemo(() => {
    const matches = gyms.filter((gym) => {
      const matchesRegion =
        selectedRegion === "전체" || gym.region === selectedRegion;

      const matchesSport =
        selectedSport === "전체" || gym.sports.includes(selectedSport);

      const matchesFavorites = !favoritesOnly || favorites.has(gym.id);

      return matchesRegion && matchesSport && matchesFavorites;
    });

    return sortGyms(matches, selectedSort, priceDir, location);
  }, [gyms, selectedRegion, selectedSport, selectedSort, priceDir, favoritesOnly, favorites, location]);

  const hasNonFavoritesFilter =
    selectedRegion !== "전체" || selectedSport !== "전체";

  // 페이지네이션(클라이언트 state). 필터로 결과가 줄면 currentPage로 clamp한다. 산식은 usePagination SSOT.
  const {
    totalPages,
    currentPage: safePage,
    pageItems: pagedGyms,
  } = usePagination(filteredGyms, page, PER_PAGE);

  // '시설 검색': 체육관을 고른 경우 상세로 이동. 체육관 미선택(전체)이면 현재 지역·종목 필터로 목록 조회(목록은 실시간 반영이라 1페이지로 정렬).
  const handleSubmit = () => {
    if (selectedGymId) {
      router.push(`/gyms/${selectedGymId}`);
      return;
    }
    dispatch({ type: "SUBMIT_SEARCH" });
  };

  // 가까운 순: 위치 없으면 브라우저 네이티브 위치 권한 팝업을 직접 띄운다(커스텀 모달 대신).
  const handleDistanceClick = () => {
    // 이미 가까운 순이면 한 번 더 눌러 해제(none)한다.
    if (selectedSort === "distance") {
      dispatch({ type: "DISTANCE_OFF" });
      return;
    }
    if (location) {
      dispatch({ type: "DISTANCE_ON" });
      return;
    }
    // 위치 미보유. 거리순 의도를 기록해 허용되면 effect가 자동 전환하게 한다.
    dispatch({ type: "DISTANCE_PENDING" });
    // 이미 차단(denied)된 경우엔 브라우저 정책상 네이티브 팝업이 다시 뜨지 않으므로
    // 재요청 없이 통일 알림창을 띄운다. 그 외(prompt 등)엔 네이티브 팝업 요청.
    if (permission === "denied") {
      setLocationDeniedAlert(true);
    } else {
      void requestLocation();
    }
  };

  // 지역·종목 변경은 cascade + 체육관 초기화 + 1페이지 전이를 리듀서가 처리한다.
  const handleRegionChange = (value: string) =>
    dispatch({ type: "SET_REGION", value, gyms });
  const handleSportChange = (value: string) =>
    dispatch({ type: "SET_SPORT", value, gyms });

  // 가격순: 꺼짐→오름차순→내림차순→해제(none) 순으로 순환(3번 누르면 해제).
  const handlePriceClick = () => dispatch({ type: "PRICE_CLICK" });

  const clearFilters = () => dispatch({ type: "CLEAR_FILTERS" });

  const sortButtonClass = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
      active
        ? "border-accent bg-accent-tint text-accent-strong"
        : "border-line-strong bg-white text-muted hover:border-accent hover:text-accent-strong"
    }`;

  return (
    <section className="flex flex-col gap-6">
      {/* 검색 패널(그림자 없이 border만 — 그림자는 카드에만). 컨트롤 톤은 홈 검색바와 동일. */}
      <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        {/* 검색바: 홈과 동일한 cascade(지역 → 종목 → 체육관 → 시설 검색).
            지역/종목은 아래 카드 목록을 즉시 필터하고, 체육관을 고른 뒤 '시설 검색'을 누르면 상세로 이동한다. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end"
        >
          {/* 지역 */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>{t("regionLabel")}</span>
            <SelectMenu
              value={selectedRegion}
              options={[
                { value: "전체", label: t("regionAll") },
                ...availableRegions.map((region) => ({
                  value: region,
                  label: region,
                })),
              ]}
              placeholder={t("regionAll")}
              ariaLabel={t("regionLabel")}
              onChange={handleRegionChange}
              triggerClassName={CONTROL_CLASS}
            />
          </div>

          {/* 종목 */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>{t("sportLabel")}</span>
            <SelectMenu
              value={selectedSport}
              options={[
                { value: "전체", label: t("sportAll") },
                ...sportOptions.map((sport) => ({
                  value: sport,
                  label: sport,
                })),
              ]}
              placeholder={t("sportAll")}
              ariaLabel={t("sportLabel")}
              onChange={handleSportChange}
              triggerClassName={CONTROL_CLASS}
            />
          </div>

          {/* 체육관 */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>{t("gymLabel")}</span>
            <SelectMenu
              value={selectedGymId}
              options={gymOptions.map((gym) => ({
                value: gym.id,
                label: gym.name,
              }))}
              placeholder={
                hasNonFavoritesFilter
                  ? t("gymCount", { count: gymOptions.length })
                  : t("gymPlaceholder")
              }
              placeholderClassName="text-slate-950"
              ariaLabel={t("gymLabel")}
              disabled={gymOptions.length === 0}
              onChange={(value) => dispatch({ type: "SET_GYM_ID", value })}
              triggerClassName={CONTROL_CLASS}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full gap-2 sm:col-span-2 lg:col-span-1"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-[18px]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            {t("searchButton")}
          </Button>
        </form>

        {/* 정렬(가까운 순·가격순) + 즐겨찾기 필터 + 초기화 */}
        <div
          className="mt-[25px] flex flex-wrap justify-end gap-2 border-t border-line pt-[25px]"
          role="group"
          aria-label={t("sortAria")}
        >
          <button
            type="button"
            onClick={handleDistanceClick}
            aria-pressed={selectedSort === "distance"}
            className={sortButtonClass(selectedSort === "distance")}
          >
            {t("sortDistance")}
          </button>

          <button
            type="button"
            onClick={handlePriceClick}
            aria-pressed={selectedSort === "price"}
            aria-label={`${t("sortPrice")} ${
              priceDir === "asc" ? t("ascending") : t("descending")
            }`}
            className={sortButtonClass(selectedSort === "price")}
          >
            {t("sortPrice")}
            {selectedSort === "price" ? <SortDirArrow dir={priceDir} /> : null}
          </button>

          {/* 즐겨찾기 필터. 정렬 버튼과 동일한 대표색(accent) 톤, 별 아이콘으로 구분.
              끄는 중이 아니고 즐겨찾기한 곳이 없으면 화면을 바꾸지 않고 알림창만 띄운다. */}
          <button
            type="button"
            onClick={() => {
              if (!favoritesOnly && favorites.size === 0) {
                setFavoritesEmptyAlert(true);
                return;
              }
              dispatch({ type: "TOGGLE_FAVORITES" });
            }}
            aria-pressed={favoritesOnly}
            className={sortButtonClass(favoritesOnly)}
          >
            <FavoriteStar className="h-4 w-4" filled={favoritesOnly} />
            {t("favoritesToggle")}
          </button>
        </div>

      </div>

      {/* 위치 권한 차단 시 통일 알림창(간결 문구). */}
      {locationDeniedAlert ? (
        <AlertModal
          message={t("locationDenied")}
          onClose={() => setLocationDeniedAlert(false)}
        />
      ) : null}

      {/* 즐겨찾기한 체육관이 없을 때 통일 알림창(화면은 그대로 유지). */}
      {favoritesEmptyAlert ? (
        <AlertModal
          message={t("favoritesEmpty")}
          onClose={() => setFavoritesEmptyAlert(false)}
        />
      ) : null}

      {toggleError && (
        <p role="alert" className="text-sm font-semibold text-error">
          {toggleError}
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm font-semibold text-error">
          {loadError}
        </p>
      )}

      {filteredGyms.length > 0 ? (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pagedGyms.map((gym, index) => (
              <GymCard
                key={gym.id}
                gym={gym}
                isFavorite={isFavorite(gym.id)}
                onToggleFavorite={() => toggleFavorite(gym.id)}
                // 첫 줄(3장) 썸네일은 첫 화면(LCP)이라 미리 로드한다.
                priorityImage={index < 3}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <BoardPagination
              page={safePage}
              totalPages={totalPages}
              onNavigate={(p) => {
                dispatch({ type: "SET_PAGE", page: p });
                // 페이지를 넘기면 목록 상단으로 스크롤한다(공지 URL 이동과 동일한 UX).
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              labels={paginationLabels}
            />
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong bg-white p-10 text-center">
          <p className="text-base font-bold text-slate-950">
            {favoritesOnly
              ? loadError
                ? t("emptyFavLoadError")
                : hasNonFavoritesFilter
                  ? t("emptyFavFiltered")
                  : t("emptyFavNone")
              : t("emptyFiltered")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {favoritesOnly
              ? loadError
                ? t("emptyFavLoadErrorDesc")
                : hasNonFavoritesFilter
                  ? t("emptyFavFilteredDesc")
                  : t("emptyFavNoneDesc")
              : t("emptyFilteredDesc")}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {favoritesOnly ? (
              <button
                type="button"
                onClick={() => dispatch({ type: "CLEAR_FAVORITES" })}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {!loadError && !hasNonFavoritesFilter
                  ? t("emptyBrowse")
                  : t("emptyClearFavorites")}
              </button>
            ) : null}
            {hasNonFavoritesFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong px-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("clearFilters")}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
