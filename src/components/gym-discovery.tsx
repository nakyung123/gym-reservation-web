"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GymCard } from "@/components/gym-card";
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
type GymSort = "distance" | "lowest-price" | "name";

const gymSortLabels: Record<GymSort, string> = {
  distance: "가까운 순",
  "lowest-price": "낮은 가격순",
  name: "이름순",
};

function distanceForSort(gym: Gym, location: GeoPoint | null): number {
  const km = calculateGymDistanceKm(gym, location);
  return km ?? Number.POSITIVE_INFINITY;
}

function sortGyms(gyms: Gym[], sort: GymSort, location: GeoPoint | null) {
  return [...gyms].sort((left, right) => {
    if (sort === "lowest-price") {
      return (
        getGymLowestPrice(left) - getGymLowestPrice(right) ||
        left.name.localeCompare(right.name)
      );
    }

    if (sort === "name") {
      return left.name.localeCompare(right.name);
    }

    // 위치 없으면 거리 정렬이 의미 없으므로 이름순으로 폴백.
    if (!location) {
      return left.name.localeCompare(right.name);
    }
    return (
      distanceForSort(left, location) - distanceForSort(right, location) ||
      left.name.localeCompare(right.name)
    );
  });
}

export function GymDiscovery({ gyms }: GymDiscoveryProps) {
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>("전체");
  const [selectedSport, setSelectedSport] = useState<SportFilter>("전체");
  const [selectedSort, setSelectedSort] = useState<GymSort>("name");
  // 거리순 클릭 시 위치 권한이 없어 모달을 띄운 경우 의도를 보존했다가
  // location이 채워지면 자동으로 거리순으로 전환한다 (재클릭 불필요).
  const [pendingSort, setPendingSort] = useState<GymSort | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites, toggleFavorite, isFavorite, toggleError, loadError } = useFavorites();
  const { location, permission, openPromptModal } = useUserLocation();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!location || !pendingSort) return;
    setSelectedSort(pendingSort);
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

    return sortGyms(matches, selectedSort, location);
  }, [gyms, query, selectedRegion, selectedSort, selectedSport, favoritesOnly, favorites, location]);

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

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-end">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              체육관 검색
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="체육관명, 지역, 주소"
              className="h-11 rounded-md border border-line-strong px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">지역</span>
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="h-11 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="전체">전체 구</option>
              {availableRegions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="종목 필터"
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
                {sport}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setFavoritesOnly((prev) => !prev)}
            aria-pressed={favoritesOnly}
            className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              favoritesOnly
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600"
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
            즐겨찾기
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {favoritesOnly ? "즐겨찾기 " : "총 "}
            <strong className="text-slate-950">{filteredGyms.length}</strong>개
            체육관
          </p>

          <div className="flex flex-wrap gap-2" role="group" aria-label="정렬 기준">
            {(Object.keys(gymSortLabels) as GymSort[]).map((sort) => {
              const isActive = selectedSort === sort;

              return (
                <button
                  key={sort}
                  type="button"
                  onClick={() => {
                    if (sort === "distance" && !location) {
                      // denied는 권한 변경 이벤트가 안 올 수 있어 pendingSort 약속을 걸지 않는다.
                      if (permission !== "denied") {
                        setPendingSort("distance");
                      }
                      openPromptModal();
                      return;
                    }
                    // 다른 정렬을 명시 선택하면 보류된 거리순 의도도 해제 (의도와
                    // 다른 자동 전환 방지).
                    setPendingSort(null);
                    setSelectedSort(sort);
                  }}
                  aria-pressed={isActive}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    isActive
                      ? "border-accent bg-accent-tint text-accent-strong"
                      : "border-line-strong bg-white text-muted hover:border-accent hover:text-accent-strong"
                  }`}
                >
                  {gymSortLabels[sort]}
                </button>
              );
            })}

            {hasActiveFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                조건 초기화
              </button>
            ) : null}
          </div>
        </div>

        {(selectedSort === "distance" || pendingSort === "distance") &&
        !location ? (
          <p
            className="mt-3 text-xs font-semibold text-warning"
            role="status"
          >
            {permission === "denied"
              ? "위치 권한이 차단되어 거리순을 사용할 수 없습니다. 브라우저 설정에서 위치 권한을 허용한 뒤 새로고침해 주세요."
              : "위치 정보가 없어 이름순으로 표시됩니다. ‘가까운 순’을 다시 눌러 권한을 허용해 주세요."}
          </p>
        ) : null}
      </div>

      {recommendation ? (
        <aside
          className="rounded-lg border border-line bg-accent-tint/40 p-4"
          aria-label="즐겨찾기 기반 추천"
        >
          <p className="text-sm font-semibold text-accent-strong">
            즐겨찾기한 지역의 다른 체육관
          </p>
          <p className="mt-1 text-xs text-slate-600">
            즐겨찾기한 {recommendation.region}을(를) 기준으로 최대 3곳을
            보여줍니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendation.gyms.map((gym) => (
              <Link
                key={gym.id}
                href={`/gyms/${gym.id}`}
                aria-label={`${gym.name} 상세 보기`}
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <div className="rounded-lg border border-dashed border-line-strong bg-white p-10 text-center">
          <p className="text-base font-bold text-slate-950">
            {favoritesOnly
              ? loadError
                ? "즐겨찾기 목록을 불러오지 못했습니다"
                : hasNonFavoritesFilter
                  ? "조건에 맞는 즐겨찾기 체육관이 없습니다"
                  : "아직 즐겨찾기한 체육관이 없어요"
              : "조건에 맞는 체육관이 없습니다"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {favoritesOnly
              ? loadError
                ? "잠시 후 다시 시도해 주세요."
                : hasNonFavoritesFilter
                  ? "검색/지역/종목 조건을 풀거나 즐겨찾기 모드를 해제해 보세요."
                  : "자주 이용하는 체육관을 저장하면 예약할 때 빠르게 찾을 수 있어요."
              : "검색어를 줄이거나 지역, 종목 조건을 바꿔보세요."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {favoritesOnly ? (
              <button
                type="button"
                onClick={() => setFavoritesOnly(false)}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {!loadError && !hasNonFavoritesFilter
                  ? "체육관 둘러보기"
                  : "즐겨찾기 해제하고 전체 보기"}
              </button>
            ) : null}
            {hasNonFavoritesFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong px-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                조건 초기화
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
