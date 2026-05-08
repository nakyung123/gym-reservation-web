"use client";

import Link from "next/link";
import { formatGymPrice, getGymLowestPrice } from "@/lib/gym-utils";
import type { Gym } from "@/types/domain";

type GymCardProps = {
  gym: Gym;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

export function GymCard({
  gym,
  isFavorite = false,
  onToggleFavorite,
}: GymCardProps) {
  const lowestPrice = getGymLowestPrice(gym);

  return (
    <article className="flex flex-col justify-between overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-sky-700">{gym.region}</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">
                {gym.name}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onToggleFavorite !== undefined && (
                <button
                  type="button"
                  onClick={onToggleFavorite}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                  className={`rounded-md p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                    isFavorite
                      ? "text-rose-500 hover:text-rose-700"
                      : "text-slate-300 hover:text-rose-400"
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill={isFavorite ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                    />
                  </svg>
                </button>
              )}
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {formatGymPrice(lowestPrice)}부터
              </span>
            </div>
          </div>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {gym.description}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-slate-500">거리</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {gym.distanceKm}km
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-500">운영시간</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {gym.openHours}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="예약 가능 종목">
            {gym.sports.map((sport) => (
              <span
                key={sport}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {sport}
              </span>
            ))}
          </div>
        </div>

        <Link
          href={`/gyms/${gym.id}`}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          상세 보기
        </Link>
      </div>
    </article>
  );
}
