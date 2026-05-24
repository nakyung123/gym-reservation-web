import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatGymPrice,
  getGymLowestPrice,
  getGymSportPrice,
} from "@/lib/gym-utils";
import { gymRepository } from "@/lib/gym-repository-provider";
import { FavoriteButton } from "@/components/favorite-button";
import { ReserveCtaButton } from "@/components/reserve-cta-button";
import { GymDistanceBadge } from "@/components/gym-distance-badge";

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
            <GymDistanceBadge latitude={gym.latitude} longitude={gym.longitude} />
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
          <p className="mt-1 text-xs text-slate-500">
            카드를 누르면 해당 종목으로 예약 흐름이 시작됩니다.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {gym.sports.map((sport) => (
              <Link
                key={sport}
                href={`/reserve/${encodeURIComponent(gym.id)}?sport=${encodeURIComponent(sport)}`}
                aria-label={`${gym.name} ${sport} 예약 시작`}
                className="group flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <span className="font-semibold text-slate-950 group-hover:text-sky-900">
                  {sport}
                </span>
                <span className="flex items-center gap-2">
                  <span>{formatGymPrice(getGymSportPrice(gym, sport))}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-slate-400 transition group-hover:text-sky-700"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </Link>
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

          {/* 예약 직전에 필요한 정보를 짧게 묶은 안내 섹션. 본문 dl(주소/운영시간/
              휴관일), 종목별 이용료, 편의시설 chip과 정보가 겹치지 않도록 각 항목
              문장을 줄이고, 카드는 3개(이용 안내 / 취소 안내 / 시설 정보)로 둔다.
              공식 시설 안내 링크는 "시설 정보"에 통합한다. */}
          <section
            className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-5"
            aria-label="예약 안내"
          >
            <h2 className="text-lg font-bold text-slate-950">예약 안내</h2>
            <p className="mt-1 text-xs text-slate-500">
              예약하기 전에 아래 내용을 확인해 주세요.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">이용 안내</h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700">
                  <li>운영 시간대 {gym.availableTimes.length}개</li>
                  <li>최저 이용료 {formatGymPrice(lowestPrice)}부터</li>
                  <li>결제는 시설 안내를 따라주세요.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950">취소 안내</h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700">
                  <li>
                    내 예약 → 예약 상세에서 취소 가능 기한 안에 취소할 수
                    있습니다.
                  </li>
                  <li>이용 일시가 지나면 자동으로 이용 완료로 표시됩니다.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950">시설 정보</h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700">
                  <li>휴관일: {gym.closedDays.join(", ")}</li>
                  <li>
                    <a
                      href={gym.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-sky-700 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    >
                      공식 시설 안내 (새 탭)
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </section>
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
          <ReserveCtaButton gymId={gym.id} />

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
