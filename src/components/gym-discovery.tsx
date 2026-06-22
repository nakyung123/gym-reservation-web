"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GymCard } from "@/components/gym-card";
import { SelectMenu } from "@/components/select-menu";
import { useFavorites } from "@/hooks/use-favorites";
import { useUserLocation } from "@/hooks/use-user-location";
import { calculateGymDistanceKm } from "@/lib/distance";
import {
  getAvailableRegions,
  getAvailableSports,
  getGymLowestPrice,
  getGymSearchText,
} from "@/lib/gym-utils";
import type { GeoPoint } from "@/lib/distance";
import type { Gym, Sport } from "@/types/domain";

type GymDiscoveryProps = {
  gyms: Gym[];
};

type SportFilter = Sport | "전체";
type RegionFilter = string | "전체";
// 정렬: 가까운 순(distance) | 가격순(price). 이름순은 제거. 가격순은 asc/desc 토글.
type GymSort = "distance" | "price";
type SortDir = "asc" | "desc";

// 검색바 입력/드롭다운 공통 컨트롤 룩(홈 검색바와 같은 높이·보더 톤).
const CONTROL_CLASS =
  "h-11 rounded-md border border-line-strong bg-white px-3 text-[15px] transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20";
const FIELD_LABEL_CLASS = "text-[12.5px] font-bold text-subtle";

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
    if (sort === "price") {
      const diff = getGymLowestPrice(left) - getGymLowestPrice(right);
      // 오름차순(낮은→높은)이 기본, 다시 누르면 내림차순. 동가는 이름순 tiebreak.
      return (dir === "desc" ? -diff : diff) || left.name.localeCompare(right.name);
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

export function GymDiscovery({ gyms }: GymDiscoveryProps) {
  const t = useTranslations("Gyms");
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>("전체");
  const [selectedSport, setSelectedSport] = useState<SportFilter>("전체");
  // 기본 정렬: 가격 오름차순(위치 권한 없이도 항상 동작).
  const [selectedSort, setSelectedSort] = useState<GymSort>("price");
  const [priceDir, setPriceDir] = useState<SortDir>("asc");
  // 거리순 클릭 시 위치 권한이 없어 모달을 띄운 경우 의도를 보존했다가
  // location이 채워지면 자동으로 거리순으로 전환한다 (재클릭 불필요).
  const [pendingSort, setPendingSort] = useState<GymSort | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites, toggleFavorite, isFavorite, toggleError, loadError } = useFavorites();
  const { location, permission, openPromptModal } = useUserLocation();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!location || pendingSort !== "distance") return;
    setSelectedSort("distance");
    setPendingSort(null);
  }, [location, pendingSort]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const availableRegions = useMemo(() => getAvailableRegions(gyms), [gyms]);
  const availableSports = useMemo(() => getAvailableSports(gyms), [gyms]);

  const filteredGyms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matches = gyms.filter((gym) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        getGymSearchText(gym).includes(normalizedQuery);

      const matchesRegion =
        selectedRegion === "전체" || gym.region === selectedRegion;

      const matchesSport =
        selectedSport === "전체" || gym.sports.includes(selectedSport);

      const matchesFavorites = !favoritesOnly || favorites.has(gym.id);

      return matchesQuery && matchesRegion && matchesSport && matchesFavorites;
    });

    return sortGyms(matches, selectedSort, priceDir, location);
  }, [gyms, query, selectedRegion, selectedSort, priceDir, selectedSport, favoritesOnly, favorites, location]);

  const hasNonFavoritesFilter =
    query.trim().length > 0 ||
    selectedRegion !== "전체" ||
    selectedSport !== "전체";
  const hasActiveFilter = hasNonFavoritesFilter || favoritesOnly;

  // /gyms는 비로그인 라우트라 reservation 구독은 도입하지 않는다.
  // 즐겨찾기 region 신호만으로 같은 지역의 다른 체육관을 최대 3개 추천한다.
  const recommendation = useMemo<
    { kind: "favorite-region"; region: string; gyms: Gym[] } | null
  >(() => {
    if (favoritesOnly) return null;
    if (favorites.size === 0) return null;

    const favGyms = gyms.filter((gym) => favorites.has(gym.id));
    const regionCount = new Map<string, number>();
    for (const gym of favGyms) {
      regionCount.set(gym.region, (regionCount.get(gym.region) ?? 0) + 1);
    }
    let topRegion: string | null = null;
    let topCount = 0;
    for (const [region, count] of regionCount.entries()) {
      if (count > topCount) {
        topRegion = region;
        topCount = count;
      }
    }
    if (!topRegion) return null;

    const candidates = gyms
      .filter((gym) => gym.region === topRegion && !favorites.has(gym.id))
      .slice(0, 3);
    if (candidates.length === 0) return null;
    return { kind: "favorite-region", region: topRegion, gyms: candidates };
  }, [favorites, favoritesOnly, gyms]);

  const clearFilters = () => {
    setQuery("");
    setSelectedRegion("전체");
    setSelectedSport("전체");
    setFavoritesOnly(false);
  };

  // 가까운 순: 위치 없으면 권한 모달을 띄우고 의도를 보존한다.
  const handleDistanceClick = () => {
    if (!location) {
      // denied는 권한 변경 이벤트가 안 올 수 있어 pendingSort 약속을 걸지 않는다.
      if (permission !== "denied") setPendingSort("distance");
      openPromptModal();
      return;
    }
    setPendingSort(null);
    setSelectedSort("distance");
  };

  // 가격순: 비활성 상태면 오름차순으로 켜고, 이미 가격순이면 방향만 토글.
  const handlePriceClick = () => {
    setPendingSort(null);
    if (selectedSort === "price") {
      setPriceDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSelectedSort("price");
      setPriceDir("asc");
    }
  };

  const sortButtonClass = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
      active
        ? "border-accent bg-accent-tint text-accent-strong"
        : "border-line-strong bg-white text-muted hover:border-accent hover:text-accent-strong"
    }`;

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
        {/* 검색 + 지역 (홈 검색바와 같은 컨트롤 톤) */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL_CLASS}>{t("searchLabel")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className={`${CONTROL_CLASS} text-slate-950 outline-none placeholder:text-subtle`}
            />
          </label>

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
              onChange={(value) => setSelectedRegion(value)}
              triggerClassName={CONTROL_CLASS}
            />
          </div>
        </div>

        {/* 종목 필터 칩 */}
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label={t("sportFilterAria")}
        >
          {(["전체", ...availableSports] as SportFilter[]).map((sport) => {
            const isActive = selectedSport === sport;

            return (
              <button
                key={sport}
                type="button"
                onClick={() => setSelectedSport(sport)}
                aria-pressed={isActive}
                className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  isActive
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line-strong bg-white text-muted hover:border-accent hover:text-accent-strong"
                }`}
              >
                {sport === "전체" ? t("filterAllSports") : sport}
              </button>
            );
          })}
        </div>

        {/* 결과 수 + 정렬(가까운 순·가격순) + 즐겨찾기 필터 + 초기화 */}
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {(favoritesOnly
              ? t.rich("countFavorites", {
                  count: filteredGyms.length,
                  b: (chunks) => (
                    <strong className="text-slate-950">{chunks}</strong>
                  ),
                })
              : t.rich("countTotal", {
                  count: filteredGyms.length,
                  b: (chunks) => (
                    <strong className="text-slate-950">{chunks}</strong>
                  ),
                }))}
          </p>

          <div
            className="flex flex-wrap gap-2"
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

            {/* 즐겨찾기 필터(종목 줄에서 이곳으로 이동). rose는 즐겨찾기 디자인 예외. */}
            <button
              type="button"
              onClick={() => setFavoritesOnly((prev) => !prev)}
              aria-pressed={favoritesOnly}
              className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                favoritesOnly
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-line-strong bg-white text-muted hover:border-rose-300 hover:text-rose-600"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={favoritesOnly ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
              {t("favoritesToggle")}
            </button>

            {hasActiveFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("clearFilters")}
              </button>
            ) : null}
          </div>
        </div>

        {(selectedSort === "distance" || pendingSort === "distance") &&
        !location ? (
          <p className="mt-3 text-xs font-semibold text-warning" role="status">
            {permission === "denied"
              ? t("locationDenied")
              : t("locationMissing")}
          </p>
        ) : null}
      </div>

      {recommendation ? (
        <aside
          className="rounded-xl border border-line bg-accent-tint/40 p-4"
          aria-label={t("recommendAria")}
        >
          <p className="text-sm font-semibold text-accent-strong">
            {t("recommendTitle")}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {t("recommendDesc", { region: recommendation.region })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendation.gyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/gyms/${gym.id}`}
                aria-label={t("viewDetailAria", { name: gym.name })}
                className="inline-flex h-9 items-center rounded-md border border-line-strong bg-white px-3 text-xs font-semibold text-accent-strong transition hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {gym.name}
              </Link>
            ))}
          </div>
        </aside>
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGyms.map((gym) => (
            <GymCard
              key={gym.id}
              gym={gym}
              isFavorite={isFavorite(gym.id)}
              onToggleFavorite={() => toggleFavorite(gym.id)}
            />
          ))}
        </div>
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
                onClick={() => setFavoritesOnly(false)}
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
