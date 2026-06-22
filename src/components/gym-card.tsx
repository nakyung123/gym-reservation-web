"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/app-button";
import { getGymLowestPrice } from "@/lib/gym-utils";
import { calculateGymDistanceKm, formatDistanceKm } from "@/lib/distance";
import { useUserLocation } from "@/hooks/use-user-location";
import type { Gym } from "@/types/domain";

/**
 * /gyms 목록 카드 — 홈 "가까운 체육시설" 카드(facility-card.tsx)와 동일한 디자인으로 통일.
 * 썸네일(그라데이션 플레이스홀더 + 예약가능 배지) → 이름 → 주소(+거리) → 종목칩 → 가격·예약 버튼.
 * /gyms 고유 기능인 즐겨찾기는 썸네일 우상단 하트로 유지(하트=토글 추가/해제, 정렬 줄의
 * '즐겨찾기'는 목록 필터). 거리는 위치 권한이 있을 때만 주소 우측에 표시한다.
 */
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
  const t = useTranslations("Gyms");
  const tFavorite = useTranslations("Favorite");
  const lowestPrice = getGymLowestPrice(gym);
  const { location } = useUserLocation();
  const distanceKm = calculateGymDistanceKm(gym, location);
  const detailHref = `/gyms/${gym.id}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:border-line-strong hover:shadow-[0_4px_16px_rgba(15,23,42,0.09)]">
      {/* 썸네일(추후 실사진 교체 지점). Link가 영역 전체를 덮고, 배지·하트는 그 위에 둔다. */}
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
        <Link
          href={detailHref}
          aria-label={t("viewDetailAria", { name: gym.name })}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center text-accent-strong/25"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-14"
            >
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01" />
            </svg>
          </span>
        </Link>

        <span className="pointer-events-none absolute left-[13px] top-[13px] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-[11px] py-[5px] text-[12.5px] font-bold text-success shadow-sm">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          {t("cardAvailable")}
        </span>

        {/* 즐겨찾기 하트(rose는 디자인 예외로 유지). 썸네일 위라 흰 원 배경으로 가시성 확보. */}
        {onToggleFavorite !== undefined ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? tFavorite("remove") : tFavorite("add")}
            className={`absolute right-[11px] top-[11px] z-10 grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isFavorite
                ? "text-rose-500"
                : "text-slate-400 hover:text-rose-400"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
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
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[19.5px] font-bold text-slate-950">
          <Link
            href={detailHref}
            className="rounded transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {gym.name}
          </Link>
        </h3>

        <p className="mt-1.5 flex items-center gap-1.5 text-[14.5px] text-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-4 shrink-0 text-subtle"
          >
            <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="truncate">{gym.address}</span>
          {distanceKm !== null ? (
            <span className="ml-auto shrink-0 font-semibold text-accent-strong">
              {formatDistanceKm(distanceKm)}
            </span>
          ) : null}
        </p>

        <div
          className="mt-[15px] flex flex-wrap gap-[7px]"
          aria-label={t("sportsAvailableAria")}
        >
          {gym.sports.map((sport) => (
            <span
              key={sport}
              className="rounded-md border border-line bg-surface-2 px-[11px] py-[5px] text-[13px] font-semibold text-muted"
            >
              {sport}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-[17px]">
          <p className="flex items-baseline">
            <span className="text-[21px] font-extrabold text-slate-950 tabular-nums">
              {lowestPrice.toLocaleString()}
            </span>
            <span className="ml-1 text-[15px] font-bold text-slate-950">
              {t("cardWon")}
            </span>
            <span className="ml-[7px] text-[13.5px] font-medium text-subtle">
              {t("cardPerHours")}
            </span>
          </p>
          <ButtonLink
            href={`/reserve/${gym.id}`}
            aria-label={t("bookAria", { name: gym.name })}
            style={{ paddingLeft: 32, paddingRight: 32 }}
          >
            {t("book")}
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
