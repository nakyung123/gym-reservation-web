import type { Metadata } from "next";
import { PasswordChangeView } from "@/components/password-change-view";

export const metadata: Metadata = {
  title: "비밀번호 변경 | 공공체육관 예약",
  description: "현재 비밀번호를 입력하고 새 비밀번호로 변경합니다.",
};

export default function PasswordChangePage() {
  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-md">
        <PasswordChangeView />
      </div>
    </main>
  );
}
