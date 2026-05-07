import Link from "next/link";
import { formatGymPrice, getGymLowestPrice } from "@/lib/gym-utils";
import type { Gym } from "@/types/domain";

type GymCardProps = {
  gym: Gym;
};

export function GymCard({ gym }: GymCardProps) {
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
            <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {formatGymPrice(lowestPrice)}부터
            </span>
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
