import { Suspense } from "react";
import { PaymentSuccessView } from "@/components/reservation/payment-result-view";

// 토스 결제창이 돌아오는 화면. 쿼리(useSearchParams)를 읽으므로 Suspense 경계가 필요하다.
export const dynamic = "force-dynamic";

export default function PaymentSuccessPage() {
  return (
    <main className="bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <Suspense fallback={null}>
        <PaymentSuccessView />
      </Suspense>
    </main>
  );
}
