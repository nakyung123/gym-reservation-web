import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ReservationForm } from "@/components/reservation/reservation-form";
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

  const t = await getTranslations("Reserve");

  return (
    <main className="bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      {/* ReservationForm이 useSearchParams로 ?sport=&date=&time= 쿼리를
          폼 초기값에 반영하므로 정적 프리렌더 경로에서 Suspense 경계가 필요하다. */}
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-190 rounded-2xl border border-line bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
            {t("formPreparing")}
          </div>
        }
      >
        <ReservationForm gym={gym} />
      </Suspense>
    </main>
  );
}
