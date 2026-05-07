"use client";

import { useMemo, useState } from "react";
import { GymCard } from "@/components/gym-card";
import {
  getAvailableSports,
  getGymLowestPrice,
  getGymSearchText,
} from "@/lib/gym-utils";
import type { Gym, Sport } from "@/types/domain";

type GymDiscoveryProps = {
  gyms: Gym[];
};

type SportFilter = Sport | "전체";
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
  const [selectedSport, setSelectedSport] = useState<SportFilter>("전체");
  const [selectedSort, setSelectedSort] = useState<GymSort>("distance");
  const availableSports = useMemo(() => getAvailableSports(gyms), [gyms]);

  const filteredGyms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matches = gyms.filter((gym) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        getGymSearchText(gym).includes(normalizedQuery);

      const matchesSport =
        selectedSport === "전체" || gym.sports.includes(selectedSport);

      return matchesQuery && matchesSport;
    });

    return sortGyms(matches, selectedSort);
  }, [gyms, query, selectedSort, selectedSport]);

  const hasActiveFilter = query.trim().length > 0 || selectedSport !== "전체";
  const clearFilters = () => {
    setQuery("");
    setSelectedSport("전체");
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="flex flex-col gap-2">
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

          <div className="flex flex-wrap gap-2" role="group" aria-label="종목 필터">
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
          </div>
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

      {filteredGyms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGyms.map((gym) => (
            <GymCard key={gym.id} gym={gym} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-base font-bold text-slate-950">
            조건에 맞는 체육관이 없습니다
          </p>
          <p className="mt-2 text-sm text-slate-600">
            검색어를 줄이거나 다른 종목을 선택해보세요.
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
