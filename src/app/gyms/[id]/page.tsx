import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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

  const t = await getTranslations("GymDetail");
  const lowestPrice = getGymLowestPrice(gym);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <Link
            href="/gyms"
            className="rounded text-sm font-semibold text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t("backToList")}
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
              className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong px-3 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {t("officialInfo")}
            </a>
            <FavoriteButton gymId={gym.id} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-accent/20 bg-accent-tint px-4 py-3">
              <p className="text-xs font-semibold text-accent-strong">
                {t("lowestFee")}
              </p>
              <p className="mt-1 text-lg font-bold text-accent-strong">
                {t("priceFrom", { price: formatGymPrice(lowestPrice) })}
              </p>
            </div>
            <GymDistanceBadge latitude={gym.latitude} longitude={gym.longitude} />
            <div className="rounded-md border border-line bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">
                {t("sportsLabel")}
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {t("sportsCount", { count: gym.sports.length })}
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                {t("addressLabel")}
              </dt>
              <dd className="mt-1 text-sm text-slate-800">{gym.address}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                {t("openHoursLabel")}
              </dt>
              <dd className="mt-1 text-sm text-slate-800">{gym.openHours}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                {t("closedDaysLabel")}
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {gym.closedDays.join(", ")}
              </dd>
            </div>
          </dl>

          <h2 className="mt-6 text-lg font-bold text-slate-950">
            {t("feeBySportTitle")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t("feeBySportDesc")}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {gym.sports.map((sport) => (
              <Link
                key={sport}
                href={`/reserve/${encodeURIComponent(gym.id)}?sport=${encodeURIComponent(sport)}`}
                aria-label={t("reserveStartAria", { name: gym.name, sport })}
                className="group flex items-center justify-between gap-4 rounded-md border border-line bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-accent hover:bg-accent-tint hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span className="font-semibold text-slate-950 group-hover:text-accent-hover">
                  {sport}
                </span>
                <span className="flex items-center gap-2">
                  <span>{formatGymPrice(getGymSportPrice(gym, sport))}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-slate-400 transition group-hover:text-accent-strong"
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

          <h2 className="mt-6 text-lg font-bold text-slate-950">
            {t("facilitiesTitle")}
          </h2>
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

          <section
            className="mt-6 rounded-md border border-line bg-slate-50 p-5"
            aria-label={t("reserveGuideAria")}
          >
            <h2 className="text-lg font-bold text-slate-950">
              {t("reserveGuideTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("reserveGuideDesc")}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  {t("useGuideTitle")}
                </h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700">
                  <li>{t("useGuideItem")}</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  {t("cancelGuideTitle")}
                </h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700">
                  <li>{t("cancelGuideItem1")}</li>
                  <li>{t("cancelGuideItem2")}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <aside className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-accent-strong">
            {t("availableEyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            {t("operatingHoursTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("operatingHoursDesc")}
          </p>
          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="list"
            aria-label={t("operatingHoursListAria")}
          >
            {gym.availableTimes.map((time) => (
              <span
                key={time}
                role="listitem"
                className="rounded-md border border-line bg-slate-50 px-2 py-2 text-center text-sm font-semibold text-slate-700"
              >
                {time}
              </span>
            ))}
          </div>
          <ReserveCtaButton gymId={gym.id} />
        </aside>
      </section>
    </main>
  );
}
