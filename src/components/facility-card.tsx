import Link from "next/link";
import { ButtonLink } from "@/components/app-button";
import { getGymLowestPrice } from "@/lib/gym-utils";
import type { Gym } from "@/types/domain";

/**
 * 홈 "가까운 체육시설" 카드(시안 .fac). gym 데이터에 사진 필드가 없어 썸네일은
 * 네이비 톤 그라데이션 플레이스홀더로 둔다. 사진 필드가 생기면 thumb 영역의
 * 그라데이션을 <img>로 교체하면 된다.
 *
 * /gyms 목록 카드(gym-card.tsx)는 즐겨찾기·거리 등 기능이 달라 당장은 분리해
 * 두고, 추후 /gyms 리디자인 시 이 카드로 통일한다.
 */
export function FacilityCard({ gym }: { gym: Gym }) {
  const lowestPrice = getGymLowestPrice(gym);
  const detailHref = `/gyms/${gym.id}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:border-line-strong hover:shadow-[0_4px_16px_rgba(15,23,42,0.09)]">
      {/* 썸네일(추후 실사진 교체 지점) */}
      <Link
        href={detailHref}
        aria-label={`${gym.name} 상세 보기`}
        className="relative block h-44 overflow-hidden bg-[linear-gradient(135deg,var(--accent-tint),var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
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
        <span className="absolute left-[13px] top-[13px] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-[11px] py-[5px] text-[12.5px] font-bold text-success shadow-sm">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          예약 가능
        </span>
      </Link>

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
          {gym.address}
        </p>

        <div className="mt-[15px] flex flex-wrap gap-[7px]" aria-label="예약 가능 종목">
          {gym.sports.map((sport) => (
            <span
              key={sport}
              className="rounded-md border border-line bg-surface-2 px-[11px] py-[5px] text-[13px] font-semibold text-muted"
            >
              {sport}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-[17px]">
          <p className="flex items-baseline">
            <span className="text-[21px] font-extrabold text-slate-950 tabular-nums">
              {lowestPrice.toLocaleString()}
            </span>
            <span className="ml-1 text-[15px] font-bold text-slate-950">원</span>
            <span className="ml-[7px] text-[13.5px] font-medium text-subtle">
              / 2시간
            </span>
          </p>
          {/* 시안 .fac .foot .btn = 좌우 32px 확대. size의 px와 충돌하지 않도록
              inline style로 확정한다(tailwind-merge 미사용 환경). */}
          <ButtonLink
            href={`/reserve/${gym.id}`}
            aria-label={`${gym.name} 예약하기`}
            style={{ paddingLeft: 32, paddingRight: 32 }}
          >
            예약하기
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
