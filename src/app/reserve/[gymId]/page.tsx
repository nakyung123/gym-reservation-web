import Link from "next/link";
import { notFound } from "next/navigation";
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
          className="w-fit rounded text-sm font-semibold text-sky-700 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          체육관 상세로
        </Link>
        <ReservationForm gym={gym} />
      </section>
    </main>
  );
}
