import { getTranslations } from "next-intl/server";
import { GymDiscovery } from "@/components/gym-discovery";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function GymsPage() {
  const gyms = await gymRepository.list();
  const t = await getTranslations("Gyms");

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold text-accent-strong">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {t("subtitle")}
          </p>
        </div>

        <GymDiscovery gyms={gyms} />
      </section>
    </main>
  );
}
