"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/app-button";
import { getGymLowestPrice, getGymThumbnail } from "@/lib/gym-utils";
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
  const router = useRouter();
  const lowestPrice = getGymLowestPrice(gym);
  const { location } = useUserLocation();
  const distanceKm = calculateGymDistanceKm(gym, location);
  const detailHref = `/gyms/${gym.id}`;
  const thumbnail = getGymThumbnail(gym.id);

  return (
    // 카드 전체를 클릭하면 상세로 이동한다(썸네일·이름 외 흰 바탕 영역 포함).
    // 즐겨찾기·예약 버튼은 목적지가 달라 stopPropagation으로 카드 이동을 막는다.
    // 키보드/스크린리더 이동은 썸네일·이름의 실제 Link가 담당한다.
    <article
      onClick={() => router.push(detailHref)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:border-line-strong hover:shadow-[0_4px_16px_rgba(15,23,42,0.09)]"
    >
      {/* 썸네일: 등록된 사진이 있으면 실사진, 없으면 그라데이션 placeholder.
          Link가 영역 전체를 덮고, 배지·하트는 그 위에 둔다. */}
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))]">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={gym.name}
            fill
            quality={90}
            sizes="(max-width: 768px) 100vw, 360px"
            className="object-cover"
          />
        ) : null}
        <Link
          href={detailHref}
          aria-label={t("viewDetailAria", { name: gym.name })}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
          {thumbnail ? null : (
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
          )}
        </Link>

        <span className="pointer-events-none absolute left-[13px] top-[13px] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-[11px] py-[5px] text-[12.5px] font-bold text-success shadow-sm">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          {t("cardAvailable")}
        </span>

        {/* 즐겨찾기 하트(rose는 디자인 예외로 유지). 썸네일 위라 흰 원 배경으로 가시성 확보. */}
        {onToggleFavorite !== undefined ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? tFavorite("remove") : tFavorite("add")}
            className={`absolute right-[11px] top-[11px] z-10 grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isFavorite
                ? "text-amber-400"
                : "text-slate-400 hover:text-amber-400"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill={isFavorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .32-.988l5.519-.442a.562.562 0 0 0 .475-.345L11.48 3.5z"
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
          className="mt-[15px] mb-[18px] flex flex-wrap gap-[7px]"
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
          <span onClick={(event) => event.stopPropagation()}>
            <ButtonLink
              href={`/reserve/${gym.id}`}
              aria-label={t("bookAria", { name: gym.name })}
              style={{ paddingLeft: 32, paddingRight: 32 }}
            >
              {t("book")}
            </ButtonLink>
          </span>
        </div>
      </div>
    </article>
  );
}
