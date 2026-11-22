import { reconcilePayments } from "@/lib/server/db-payment-repository";
import { safeEqualToken } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";
// reconcilePayments의 처리 시간 한도(240초)보다 길게 둔다. PG 호출이 많아도 중간에 잘리지 않게 한다.
export const maxDuration = 300;

// 결제 정리 cron. 만료된 선점 반환, 결과를 모르는 승인(confirming) 확정·환불, 환불 대기 재시도.
// 인증은 daily-report와 같다: Vercel Cron이 Authorization: Bearer <CRON_SECRET>를 붙인다.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron payment-reconcile] CRON_SECRET 미설정");
    return Response.json(
      { ok: false, message: "CRON_SECRET이 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!safeEqualToken(authorization, `Bearer ${secret}`)) {
    return Response.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcilePayments();
    // 처리 중 오류가 있으면 성공으로 덮지 않는다(Vercel cron 로그에서 실패로 보이게).
    return Response.json(
      { ok: summary.errors === 0, summary },
      { status: summary.errors === 0 ? 200 : 500 },
    );
  } catch (error) {
    console.error("[cron payment-reconcile] failed", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return Response.json(
      { ok: false, message: "결제 정리 작업에 실패했습니다." },
      { status: 500 },
    );
  }
}
