import { FacilityCard } from "@/components/gym/facility-card";
import { HomeEvents } from "@/components/home/home-events";
import { HomeHero } from "@/components/home/home-hero";
import { HomeQuickActions } from "@/components/home/home-quick-actions";
import { gymRepository } from "@/lib/gym-repository-provider";
import { getTranslations } from "next-intl/server";

// 홈은 섹션 컴포넌트를 순서대로 조립한다. 섹션 추가/삭제/순서 변경은 이 본문에서,
// 각 섹션의 스타일/문구는 해당 컴포넌트에서 수정한다. (구조 유연성 우선)
export default async function Home() {
  const t = await getTranslations("Home");
  const gyms = await gymRepository.list();
  const recommendedGyms = gyms.slice(0, 3);

  return (
    <main className="bg-background text-foreground">
      <HomeHero />
      <HomeQuickActions />

      {/* 가까운 체육시설 */}
      <section className="py-[72px]">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
          <div className="mb-[30px]">
            <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
              FACILITIES
            </p>
            <h2 className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-slate-950">
              {t("facilitiesTitle")}
            </h2>
            <p className="mt-[9px] text-[16.5px] text-muted">
              {t("facilitiesSubtitle")}
            </p>
          </div>

          {recommendedGyms.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recommendedGyms.map((gym) => (
                <FacilityCard key={gym.id} gym={gym} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-white px-5 py-8 text-center text-sm text-muted">
              {t("facilitiesEmpty")}
            </p>
          )}
        </div>
      </section>

      <HomeEvents />
    </main>
  );
}
