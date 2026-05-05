"use client";

import { useMemo, useState } from "react";
import { GymCard } from "@/components/gym-card";
import type { Gym, Sport } from "@/types/domain";

type GymDiscoveryProps = {
  gyms: Gym[];
};

const allSports: Sport[] = ["배드민턴", "농구", "풋살", "탁구", "배구"];

export function GymDiscovery({ gyms }: GymDiscoveryProps) {
  const [query, setQuery] = useState("");
  const [selectedSport, setSelectedSport] = useState<Sport | "전체">("전체");

  const filteredGyms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return gyms.filter((gym) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [gym.name, gym.region, gym.address, gym.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesSport =
        selectedSport === "전체" || gym.sports.includes(selectedSport);

      return matchesQuery && matchesSport;
    });
  }, [gyms, query, selectedSport]);

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
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

          <div className="flex flex-wrap gap-2">
            {["전체", ...allSports].map((sport) => {
              const isActive = selectedSport === sport;

              return (
                <button
                  key={sport}
                  type="button"
                  onClick={() => setSelectedSport(sport as Sport | "전체")}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
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

        <p className="mt-4 text-sm text-slate-600">
          총 <strong className="text-slate-950">{filteredGyms.length}</strong>개
          체육관
        </p>
      </div>

      {filteredGyms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGyms.map((gym) => (
            <GymCard key={gym.id} gym={gym} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-bold text-slate-950">
            조건에 맞는 체육관이 없습니다
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            검색어를 줄이거나 다른 종목을 선택해보세요.
          </p>
        </div>
      )}
    </section>
  );
}
