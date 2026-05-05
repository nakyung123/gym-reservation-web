import Link from "next/link";
import { notFound } from "next/navigation";
import { gyms } from "@/lib/mock-data";

type GymDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return gyms.map((gym) => ({ id: gym.id }));
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { id } = await params;
  const gym = gyms.find((item) => item.id === id);

  if (!gym) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Link
            href="/gyms"
            className="text-sm font-semibold text-sky-700 hover:text-sky-900"
          >
            체육관 목록으로
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-slate-950">
            {gym.name}
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {gym.description}
          </p>

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
                거리
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                현재 위치 기준 {gym.distanceKm}km
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                휴관
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {gym.closedDays.join(", ")}
              </dd>
            </div>
          </dl>

          <div className="mt-6 h-44 rounded-lg border border-slate-200 bg-[linear-gradient(135deg,#e0f2fe_0%,#f8fafc_50%,#dcfce7_100%)]" />

          <h2 className="mt-6 text-lg font-bold text-slate-950">이용 종목</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {gym.sports.map((sport) => (
              <div
                key={sport}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-950">{sport}</span>
                <span className="ml-2">
                  {(gym.sportPrices[sport] ?? gym.basePrice).toLocaleString()}원
                </span>
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
            오늘 남은 시간
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {gym.availableTimes.slice(0, 6).map((time) => (
              <span
                key={time}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-center text-sm font-semibold text-emerald-800"
              >
                {time}
              </span>
            ))}
          </div>
          <Link
            href={`/reserve/${gym.id}`}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            예약하기
          </Link>
        </aside>
      </section>
    </main>
  );
}
