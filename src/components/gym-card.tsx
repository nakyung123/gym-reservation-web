"use client";

import Link from "next/link";
import { formatGymPrice, getGymLowestPrice } from "@/lib/gym-utils";
import { calculateGymDistanceKm, formatDistanceKm } from "@/lib/distance";
import { useUserLocation } from "@/hooks/use-user-location";
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
  const { location } = useUserLocation();
  const distanceKm = calculateGymDistanceKm(gym, location);

  return (
    <article className="flex flex-col justify-between overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-accent-strong">{gym.region}</p>
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
                  className={`rounded-md p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
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
              <span className="rounded-md bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-strong">
                {formatGymPrice(lowestPrice)}부터
              </span>
            </div>
          </div>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {gym.description}
          </p>
          <dl
            className={`mt-4 grid gap-3 text-sm ${
              distanceKm !== null ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {distanceKm !== null ? (
              <div>
                <dt className="text-xs font-semibold text-slate-500">거리</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {formatDistanceKm(distanceKm)}
                </dd>
              </div>
            ) : null}
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

          {/* 사용자가 카드에서 바로 판단할 수 있는 메타 배지. 슬롯 조회 없이
              안전하게 말할 수 있는 정보만 노출하고, "예약 가능/마감"은 표시하지
              않는다. 종목 chip이 길어진 카드에서도 줄바꿈으로 자연스럽게 흐른다. */}
          <div
            className="mt-3 flex flex-wrap gap-1.5"
            aria-label="시설 정보 요약"
          >
            <span className="inline-flex h-6 items-center rounded-full border border-line bg-white px-2 text-xs font-semibold text-muted">
              종목 {gym.sports.length}개
            </span>
            {gym.openHours ? (
              <span className="inline-flex h-6 items-center rounded-full border border-line bg-surface-2 px-2 text-xs font-semibold text-muted">
                운영시간 안내
              </span>
            ) : null}
            {gym.closedDays.length > 0 ? (
              <span className="inline-flex h-6 items-center rounded-full border border-warning/30 bg-warning/10 px-2 text-xs font-semibold text-warning">
                휴관일 있음
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/gyms/${gym.id}`}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong px-4 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            상세 보기
          </Link>
          {/* 즐겨찾기한 체육관 카드에서는 상세를 거치지 않고 바로 예약 폼으로
              진입할 수 있는 단축 액션을 제공한다. /reserve/[gymId]에서 본인 인증
              가드가 동작하므로 별도 로그인 모달은 필요하지 않다. */}
          {isFavorite ? (
            <Link
              href={`/reserve/${gym.id}`}
              aria-label={`${gym.name} 예약하기`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              예약하기
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
