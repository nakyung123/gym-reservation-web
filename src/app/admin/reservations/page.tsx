import { AdminReservationsView } from "@/components/admin/admin-reservations-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export const dynamic = "force-dynamic";

export default async function AdminReservationsPage() {
  const gyms = await gymRepository.list();
  return <AdminReservationsView gyms={gyms} />;
}
