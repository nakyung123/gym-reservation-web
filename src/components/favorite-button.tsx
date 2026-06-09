"use client";

import { useFavorites } from "@/hooks/use-favorites";

type FavoriteButtonProps = {
  gymId: string;
  className?: string;
};

export function FavoriteButton({ gymId, className = "" }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite, toggleError, loadError } = useFavorites();
  const active = isFavorite(gymId);

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={() => toggleFavorite(gymId)}
        aria-pressed={active}
        aria-label={active ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          active
            ? "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100"
            : "border-line-strong bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600"
        } ${className}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
        {active ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      </button>
      {loadError && (
        <p role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">
          {loadError}
        </p>
      )}
      {toggleError && (
        <p role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">
          {toggleError}
        </p>
      )}
    </div>
  );
}
