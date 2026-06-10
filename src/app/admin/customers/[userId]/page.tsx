import { AdminCustomerDetailView } from "@/components/admin/admin-customer-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <AdminCustomerDetailView userId={userId} />;
}
