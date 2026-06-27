import { Suspense } from "react";
import { HandoverFlow } from "@/components/handover-flow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "로그인 처리 중 — 서울체육예약",
};

export default function HandoverPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4 py-10">
      <Suspense fallback={<HandoverLoadingPanel />}>
        <HandoverFlow />
      </Suspense>
    </main>
  );
}

function HandoverLoadingPanel() {
  return (
    <section
      className="w-full rounded-lg border border-line bg-white p-6 text-center shadow-sm"
      aria-busy="true"
    >
      <p className="text-sm font-semibold text-accent-strong">로그인 처리</p>
      <h1 className="mt-2 text-xl font-bold text-slate-950">
        로그인 정보를 확인하고 있습니다
      </h1>
      <div className="mt-6 flex justify-center" aria-hidden="true">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    </section>
  );
}
