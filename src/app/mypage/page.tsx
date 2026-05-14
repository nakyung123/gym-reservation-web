import type { Metadata } from "next";
import { MypageView } from "@/components/mypage-view";

export const metadata: Metadata = {
  title: "내 정보 | 공공체육관 예약",
  description: "계정 정보, 예약 요약, 즐겨찾기 요약을 확인합니다.",
};

export default function MypagePage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <MypageView />
    </main>
  );
}
