import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReservationForm } from "@/components/reservation-form";
import { gymRepository } from "@/lib/gym-repository-provider";

type ReservePageProps = {
  params: Promise<{
    gymId: string;
  }>;
};

export async function generateStaticParams() {
  const gyms = await gymRepository.list();

  return gyms.map((gym) => ({ gymId: gym.id }));
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { gymId } = await params;
  const gym = await gymRepository.findById(gymId);

  if (!gym) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <Link
          href={`/gyms/${gym.id}`}
          className="w-fit rounded text-sm font-semibold text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          체육관 상세로
        </Link>
        {/* ReservationForm이 useSearchParams로 ?sport=&date=&time= 쿼리를
            폼 초기값에 반영하므로 정적 프리렌더 경로에서 Suspense 경계가 필요하다. */}
        <Suspense
          fallback={
            <div className="rounded-lg border border-line bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
              예약 폼을 준비하고 있습니다.
            </div>
          }
        >
          <ReservationForm gym={gym} />
        </Suspense>
      </section>
    </main>
  );
}
