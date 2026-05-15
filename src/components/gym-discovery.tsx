"use client";

import { useMemo, useState } from "react";
import { GymCard } from "@/components/gym-card";
import { useFavorites } from "@/hooks/use-favorites";
import {
  getAvailableRegions,
  getAvailableSports,
  getGymLowestPrice,
  getGymSearchText,
} from "@/lib/gym-utils";
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

function sortGyms(gyms: Gym[], sort: GymSort) {
  return [...gyms].sort((left, right) => {
    if (sort === "lowest-price") {
      return (
        getGymLowestPrice(left) - getGymLowestPrice(right) ||
        left.distanceKm - right.distanceKm ||
        left.name.localeCompare(right.name)
      );
    }

    if (sort === "name") {
      return (
        left.name.localeCompare(right.name) || left.distanceKm - right.distanceKm
      );
    }

    return (
      left.distanceKm - right.distanceKm || left.name.localeCompare(right.name)
    );
  });
}

export function GymDiscovery({ gyms }: GymDiscoveryProps) {
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>("전체");
  const [selectedSport, setSelectedSport] = useState<SportFilter>("전체");
  const [selectedSort, setSelectedSort] = useState<GymSort>("distance");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites, toggleFavorite, isFavorite, toggleError, loadError } = useFavorites();

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

    return sortGyms(matches, selectedSort);
  }, [gyms, query, selectedRegion, selectedSort, selectedSport, favoritesOnly, favorites]);

  const hasActiveFilter =
    query.trim().length > 0 ||
    selectedRegion !== "전체" ||
    selectedSport !== "전체" ||
    favoritesOnly;

  const clearFilters = () => {
    setQuery("");
    setSelectedRegion("전체");
    setSelectedSport("전체");
    setFavoritesOnly(false);
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-end">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              체육관 검색
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="체육관명, 지역, 주소"
              className="h-11 rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">지역</span>
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
                className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-800"
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
            className={`inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
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

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            총{" "}
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
                  onClick={() => setSelectedSort(sort)}
                  aria-pressed={isActive}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                    isActive
                      ? "border-sky-700 bg-sky-50 text-sky-800"
                      : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-800"
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
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                조건 초기화
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {toggleError && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {toggleError}
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
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
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-base font-bold text-slate-950">
            {favoritesOnly
              ? loadError
                ? "즐겨찾기 목록을 불러오지 못했습니다"
                : "즐겨찾기한 체육관이 없습니다"
              : "조건에 맞는 체육관이 없습니다"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {favoritesOnly
              ? loadError
                ? "잠시 후 다시 시도해 주세요."
                : "체육관 목록에서 하트 버튼을 눌러 즐겨찾기를 추가해 보세요."
              : "검색어를 줄이거나 지역, 종목 조건을 바꿔보세요."}
          </p>
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              조건 초기화
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
