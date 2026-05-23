import { Suspense } from "react";
import { ReservationsView } from "@/components/reservations-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function ReservationsPage() {
  const gyms = await gymRepository.list();

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      {/* ReservationsView가 useSearchParams로 ?status= 필터를 읽으므로 Suspense 경계가 필요하다. */}
      <Suspense fallback={<ReservationsViewFallback />}>
        <ReservationsView gyms={gyms} />
      </Suspense>
    </main>
  );
}

function ReservationsViewFallback() {
  return (
    <section
      className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-sky-700">내 예약</p>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
        예약 정보를 불러오고 있습니다
      </h1>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
      </div>
    </section>
  );
}
