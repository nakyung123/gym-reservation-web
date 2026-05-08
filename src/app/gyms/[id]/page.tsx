import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatGymPrice,
  getGymLowestPrice,
  getGymSportPrice,
} from "@/lib/gym-utils";
import { gymRepository } from "@/lib/gym-repository-provider";
import { FavoriteButton } from "@/components/favorite-button";

type GymDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateStaticParams() {
  const gyms = await gymRepository.list();

  return gyms.map((gym) => ({ id: gym.id }));
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { id } = await params;
  const gym = await gymRepository.findById(id);

  if (!gym) {
    notFound();
  }

  const lowestPrice = getGymLowestPrice(gym);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Link
            href="/gyms"
            className="rounded text-sm font-semibold text-sky-700 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            체육관 목록으로
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-slate-950">
            {gym.name}
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {gym.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={gym.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              공식 시설 안내
            </a>
            <FavoriteButton gymId={gym.id} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">
                최저 이용료
              </p>
              <p className="mt-1 text-lg font-bold text-emerald-900">
                {formatGymPrice(lowestPrice)}부터
              </p>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-xs font-semibold text-sky-700">거리</p>
              <p className="mt-1 text-lg font-bold text-sky-900">
                {gym.distanceKm}km
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">종목</p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {gym.sports.length}개
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                주소
              </dt>
              <dd className="mt-1 text-sm text-slate-800">{gym.address}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                운영시간
              </dt>
              <dd className="mt-1 text-sm text-slate-800">{gym.openHours}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                휴관일
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {gym.closedDays.join(", ")}
              </dd>
            </div>
          </dl>

          <h2 className="mt-6 text-lg font-bold text-slate-950">
            종목별 이용료
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {gym.sports.map((sport) => (
              <div
                key={sport}
                className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-950">{sport}</span>
                <span>{formatGymPrice(getGymSportPrice(gym, sport))}</span>
              </div>
            ))}
          </div>

          <h2 className="mt-6 text-lg font-bold text-slate-950">편의시설</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {gym.facilities.map((facility) => (
              <span
                key={facility}
                className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
              >
                {facility}
              </span>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">예약 가능</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            운영 시간대
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            실제 예약 가능 여부는 날짜와 종목을 선택한 뒤 예약 내역과 함께
            확인합니다.
          </p>
          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="list"
            aria-label="운영 시간대 목록"
          >
            {gym.availableTimes.map((time) => (
              <span
                key={time}
                role="listitem"
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm font-semibold text-slate-700"
              >
                {time}
              </span>
            ))}
          </div>
          <Link
            href={`/reserve/${gym.id}`}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            예약하기
          </Link>

          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-950">예약 전 확인</h3>
            <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
              <li>휴관일: {gym.closedDays.join(", ")}</li>
              <li>운영시간: {gym.openHours}</li>
              <li>최저 이용료: {formatGymPrice(lowestPrice)}</li>
              <li>앱에서 만든 예약은 실제 시설 예약으로 접수되지 않습니다.</li>
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
