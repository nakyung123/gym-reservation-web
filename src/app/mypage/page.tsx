import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { MypageView } from "@/components/mypage-view";
import { gymRepository } from "@/lib/gym-repository-provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Mypage");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

export default async function MypagePage() {
  // 예약내역 탭의 ReservationsView가 시설명을 매핑하려면 gym 목록이 필요하다.
  const gyms = await gymRepository.list();

  return (
    <main className="bg-background text-foreground">
      {/* MypageView/ReservationsView가 useSearchParams(?tab=, ?status=)를 읽으므로 Suspense 경계가 필요하다. */}
      <Suspense fallback={null}>
        <MypageView gyms={gyms} />
      </Suspense>
    </main>
  );
}
