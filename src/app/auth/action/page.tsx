import { Suspense } from "react";
import { AuthActionView } from "@/components/auth-action-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "아이디 / 비밀번호 찾기 — 서울체육예약",
};

export default function AuthActionPage() {
  return (
    <main className="w-full">
      <Suspense fallback={null}>
        <AuthActionView />
      </Suspense>
    </main>
  );
}
