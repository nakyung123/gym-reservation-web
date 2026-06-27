import { Suspense } from "react";
import { LoginView } from "@/components/login-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "로그인 — 서울체육예약",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </main>
  );
}
