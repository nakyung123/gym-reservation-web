import type { Metadata } from "next";
import { WithdrawView } from "@/components/withdraw-view";

export const metadata: Metadata = {
  title: "회원 탈퇴 | 공공체육관 예약",
  description: "계정과 모든 데이터를 삭제하고 서비스를 탈퇴합니다.",
};

export default function WithdrawPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-md">
        <WithdrawView />
      </div>
    </main>
  );
}
