import Link from "next/link";
import { notFound } from "next/navigation";
import { ReservationForm } from "@/components/reservation-form";
import { gyms } from "@/lib/mock-data";

type ReservePageProps = {
  params: Promise<{
    gymId: string;
  }>;
};

export function generateStaticParams() {
  return gyms.map((gym) => ({ gymId: gym.id }));
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { gymId } = await params;
  const gym = gyms.find((item) => item.id === gymId);

  if (!gym) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <Link
          href={`/gyms/${gym.id}`}
          className="w-fit text-sm font-semibold text-sky-700 hover:text-sky-900"
        >
          체육관 상세로
        </Link>
        <ReservationForm gym={gym} />
      </section>
    </main>
  );
}
