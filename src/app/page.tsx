import Link from "next/link";
import { GymCard } from "@/components/gym-card";
import { HomeLocationPrompt } from "@/components/home-location-prompt";
import {
  formatGymPrice,
  getAvailableRegions,
  getAvailableSports,
  getGymLowestPrice,
} from "@/lib/gym-utils";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function Home() {
  const gyms = await gymRepository.list();
  const availableRegions = getAvailableRegions(gyms);
  const availableSports = getAvailableSports(gyms);
  const lowestPrice =
    gyms.length > 0
      ? Math.min(...gyms.map((gym) => getGymLowestPrice(gym)))
      : null;
  const recommendedGyms = gyms.slice(0, 3);
  const flowSteps = [
    {
      title: "체육관 찾기",
      description: "지역, 종목, 가격 조건으로 공공체육관을 비교합니다.",
    },
    {
      title: "예약 선택",
      description: "원하는 종목과 날짜, 남은 시간대를 선택합니다.",
    },
    {
      title: "내 예약 확인",
      description: "예약 내역과 모바일 입장권 상태를 확인합니다.",
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <HomeLocationPrompt />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <div className="grid gap-6 border-b border-line pb-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-accent-strong">
              서울 공공체육시설 예약
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
              서울 공공체육관을 찾고 예약 흐름을 확인하세요
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              서울 공공체육시설의 종목, 운영시간, 가격, 남은 시간대를 한
              흐름에서 확인하고 예약 내역까지 관리합니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/gyms"
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                체육관 찾기
              </Link>
              <Link
                href="/reservations"
                className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                내 예약
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-accent-strong">예약 흐름</p>
            <div className="mt-4 grid gap-3">
              {flowSteps.map((step, index) => (
                <div
                  key={step.title}
                  className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-md border border-line bg-slate-50 p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-white text-sm font-bold text-slate-950">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">
                      {step.title}
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="예약 서비스 요약"
        >
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">등록 체육관</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {gyms.length}곳
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">서울 지역구</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {availableRegions.length}개
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">예약 종목</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {availableSports.length}개
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">최저 이용료</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {lowestPrice !== null ? `${formatGymPrice(lowestPrice)}부터` : "–"}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                추천 체육관
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                상세 화면에서 날짜별 예약 가능 시간을 확인하세요.
              </p>
            </div>
            <Link
              href="/gyms"
              className="shrink-0 text-sm font-semibold text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
            >
              전체 보기
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recommendedGyms.map((gym) => (
              <GymCard key={gym.id} gym={gym} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
