import { notFound } from "next/navigation";
import { gymRepository } from "@/lib/gym-repository-provider";
import { getGymThumbnail } from "@/lib/gym-utils";
import { GymDetailView } from "@/components/gym-detail-view";

type GymDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateStaticParams() {
  const gyms = await gymRepository.list();

  return gyms.map((gym) => ({ id: gym.id }));
}

export default async function GymDetailPage({ params }: GymDetailPageProps) {
  const { id } = await params;
  const gym = await gymRepository.findById(id);

  if (!gym) {
    notFound();
  }

  return <GymDetailView gym={gym} thumbnail={getGymThumbnail(gym.id)} />;
}
