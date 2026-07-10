import { Suspense } from "react";
import { SignupView } from "@/components/auth/signup-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "회원가입 — 서울체육예약",
};

export default function SignupPage() {
  return (
    <main className="w-full">
      <Suspense fallback={null}>
        <SignupView />
      </Suspense>
    </main>
  );
}
