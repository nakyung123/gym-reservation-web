import { Suspense } from "react";
import { SignupView } from "@/components/signup-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "회원가입 — 서울체육예약",
};

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <Suspense fallback={null}>
        <SignupView />
      </Suspense>
    </main>
  );
}
