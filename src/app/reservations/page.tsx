import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ReservationsView } from "@/components/reservations-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function ReservationsPage() {
  const gyms = await gymRepository.list();
  const t = await getTranslations("Reservations");

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      {/* ReservationsView가 useSearchParams로 ?status= 필터를 읽으므로 Suspense 경계가 필요하다. */}
      <Suspense
        fallback={
          <ReservationsViewFallback
            eyebrow={t("eyebrow")}
            title={t("loadingTitle")}
          />
        }
      >
        <ReservationsView gyms={gyms} />
      </Suspense>
    </main>
  );
}

function ReservationsViewFallback({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-line bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-accent-strong">{eyebrow}</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    </section>
  );
}
