import Link from "next/link";
import { GymCard } from "@/components/gym-card";
import { gyms } from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-sky-700">
              공공체육관 예약 플랫폼
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
              오늘 예약 가능한 체육관
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              지역 공공체육관의 종목, 운영시간, 예약 가능 시간을 한 번에
              확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gyms"
              className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              체육관 찾기
            </Link>
            <Link
              href="/reservations"
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800"
            >
              내 예약
            </Link>
          </div>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                추천 체육관
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                가까운 체육관과 예약 가능한 종목을 확인하세요.
              </p>
            </div>
            <Link
              href="/gyms"
              className="text-sm font-semibold text-sky-700 hover:text-sky-900"
            >
              전체 보기
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {gyms.slice(0, 3).map((gym) => (
              <GymCard key={gym.id} gym={gym} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
