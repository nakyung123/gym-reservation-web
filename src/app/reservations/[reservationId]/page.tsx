import { ReservationDetailView } from "@/components/reservation-detail-view";
import { gymRepository } from "@/lib/gym-repository-provider";

type ReservationDetailPageProps = {
  params: Promise<{
    reservationId: string;
  }>;
};

export default async function ReservationDetailPage({
  params,
}: ReservationDetailPageProps) {
  const { reservationId } = await params;
  const gyms = await gymRepository.list();

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <ReservationDetailView gyms={gyms} reservationId={reservationId} />
    </main>
  );
}
