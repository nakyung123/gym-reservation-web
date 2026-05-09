import { AdminReservationSlotsForm } from "@/components/admin/admin-reservation-slots-form";
import { gymRepository } from "@/lib/gym-repository-provider";

export const dynamic = "force-dynamic";

export default async function AdminReservationSlotsPage() {
  const gyms = await gymRepository.list();
  return <AdminReservationSlotsForm gyms={gyms} />;
}
