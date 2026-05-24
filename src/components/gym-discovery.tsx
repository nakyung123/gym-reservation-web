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

// 사용자 위치 ↔ 체육관 거리. 좌표 없거나 위치 없으면 Infinity (정렬 시 뒤로 밀려남).
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

    // distance: 위치가 없으면 거리 정렬은 의미가 없으므로 이름순으로 폴백한다 (UI에서
    // 위치 권한이 없으면 거리순 클릭 시 모달을 띄워 정렬 자체가 적용되지 않게 한다).
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
  // 사용자 위치가 없으면 거리순이 작동하지 않으므로 기본 정렬을 이름순으로 둔다.
  const [selectedSort, setSelectedSort] = useState<GymSort>("name");
  // 거리순을 클릭했으나 위치가 없어 모달을 띄운 경우 의도를 기억해 둔다.
  // location이 채워지면 자동으로 selectedSort를 distance로 전환한다 (사용자 재클릭 불필요).
  const [pendingSort, setPendingSort] = useState<GymSort | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites, toggleFavorite, isFavorite, toggleError, loadError } = useFavorites();
  const { location, permission, openPromptModal } = useUserLocation();

  // location이 채워지고 pendingSort가 있으면 정렬 적용 후 pending 해제.
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

  // 즐겨찾기 외 다른 필터(검색/지역/종목)가 걸려 있는지. 즐겨찾기 빈 상태에서 다른
  // 조건도 함께 적용 중이라는 사실을 사용자가 인지하도록 메시지 분기에 사용한다.
  const hasNonFavoritesFilter =
    query.trim().length > 0 ||
    selectedRegion !== "전체" ||
    selectedSport !== "전체";
  const hasActiveFilter = hasNonFavoritesFilter || favoritesOnly;

  // 가벼운 클라이언트 측 추천. 즐겨찾기 체육관들의 region 중 가장 많은 지역에서
  // 즐겨찾기 외 체육관을 최대 3개 추천한다. 즐겨찾기 신호가 없으면 null이라
  // 섹션 자체가 숨는다. /gyms는 비로그인도 접근 가능한 라우트라 예약 저장소
  // 구독은 일부러 도입하지 않는다 — 인증 의존이 늘면 비로그인 fetch가 발동할
  // 수 있고 라우트 비용도 커진다. 즐겨찾기만 보기 모드(favoritesOnly)에서는 본
  // 화면 의도와 어긋나므로 노출하지 않는다.
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
          {/* 즐겨찾기 모드일 때 헤더 카운트도 "즐겨찾기 N개"로 분기해 사용자가
              현재 어떤 뷰에 있는지 한눈에 인식하게 한다. 토글 자체는 종목 필터
              아래에 그대로 둔다. */}
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
                    // 거리순은 위치 권한이 필요하다. 권한이 없으면 정렬을 적용하지 않고
                    // 권한 안내 모달을 띄우되 의도를 pendingSort로 보존한다 → 사용자가
                    // 허용을 마치면 useEffect가 자동으로 거리순으로 전환한다.
                    // 단 denied(차단) 상태에서는 권한 변경 이벤트가 들어오지 않을 수
                    // 있으므로 pendingSort 약속을 걸지 않고 모달만 띄운다.
                    if (sort === "distance" && !location) {
                      if (permission !== "denied") {
                        setPendingSort("distance");
                      }
                      openPromptModal();
                      return;
                    }
                    // 거리순이 아닌 다른 정렬을 명시 선택하면 보류 중이던 거리순 의도도
                    // 함께 해제한다. 그렇지 않으면 나중에 권한이 granted로 바뀔 때
                    // 사용자가 의도와 다르게 거리순으로 자동 전환된다.
                    setPendingSort(null);
                    setSelectedSort(sort);
                  }}
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

        {/* "가까운 순"이 적용 중이거나(selectedSort), 권한 허용을 기다리는 상태(pendingSort)
            에서 위치가 비어 있으면 sortGyms가 이름순으로 폴백되므로 사용자에게 정렬 결과가
            의도와 다를 수 있음을 짧게 안내한다. 차단(denied) 상태에서는 다시 누르라는 안내가
            의미 없으므로 메시지를 분기한다. */}
        {(selectedSort === "distance" || pendingSort === "distance") &&
        !location ? (
          <p
            className="mt-3 text-xs font-semibold text-amber-700"
            role="status"
          >
            {permission === "denied"
              ? "위치 권한이 차단되어 거리순을 사용할 수 없습니다. 브라우저 설정에서 위치 권한을 허용한 뒤 새로고침해 주세요."
              : "위치 정보가 없어 이름순으로 표시됩니다. ‘가까운 순’을 다시 눌러 권한을 허용해 주세요."}
          </p>
        ) : null}
      </div>

      {/* 가벼운 추천 섹션. 즐겨찾기 신호가 없거나 후보가 없으면 null이라 섹션
          자체가 사라진다. 추천 근거(어느 지역인지)는 보조 문구에서 한 번
          짚어준다. 카드 그리드와 톤이 너무 비슷해지지 않도록 옅은 sky 톤을 쓴다. */}
      {recommendation ? (
        <aside
          className="rounded-lg border border-sky-200 bg-sky-50/40 p-4"
          aria-label="즐겨찾기 기반 추천"
        >
          <p className="text-sm font-semibold text-sky-800">
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
                className="inline-flex h-9 items-center rounded-md border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-800 transition hover:border-sky-500 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                {gym.name}
              </Link>
            ))}
          </div>
        </aside>
      ) : null}

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
                : hasNonFavoritesFilter
                  ? "조건에 맞는 즐겨찾기 체육관이 없습니다"
                  : "즐겨찾기한 체육관이 없습니다"
              : "조건에 맞는 체육관이 없습니다"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {favoritesOnly
              ? loadError
                ? "잠시 후 다시 시도해 주세요."
                : hasNonFavoritesFilter
                  ? "검색/지역/종목 조건을 풀거나 즐겨찾기 모드를 해제해 보세요."
                  : "체육관 목록에서 하트 버튼을 눌러 즐겨찾기를 추가해 보세요."
              : "검색어를 줄이거나 지역, 종목 조건을 바꿔보세요."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {/* 즐겨찾기만 보기 상태에서는 사용자가 다른 체육관에서 하트를 눌러야
                즐겨찾기가 채워지므로, "즐겨찾기 해제" CTA를 명시적으로 둔다.
                "조건 초기화"는 다른 필터까지 함께 비우는 별도 동작이라 그대로 유지.
                로드 실패 상태에서도 모드를 끄고 빠져나갈 수 있도록 loadError 가드는
                두지 않는다. */}
            {favoritesOnly ? (
              <button
                type="button"
                onClick={() => setFavoritesOnly(false)}
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                즐겨찾기 해제하고 전체 보기
              </button>
            ) : null}
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
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
