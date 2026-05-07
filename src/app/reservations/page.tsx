import { ReservationsView } from "@/components/reservations-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export default async function ReservationsPage() {
  const gyms = await gymRepository.list();

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <ReservationsView gyms={gyms} />
    </main>
  );
}
