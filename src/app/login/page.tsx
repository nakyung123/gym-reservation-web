import { Suspense } from "react";
import { LoginView } from "@/components/auth/login-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "로그인 — 서울체육예약",
};

export default function LoginPage() {
  return (
    <main className="w-full">
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </main>
  );
}
