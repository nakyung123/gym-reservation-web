import { syncReservationLedger } from "@/lib/server/sheets-ledger";
import { safeEqualToken } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 예약/정산 원장(데모) 동기화 엔드포인트.
// 운영 일일 리포트(Slack)와 분리한 별도 엔드포인트다 — 데모성이라 운영 스케줄에 묶지 않고
// 시연 때 수동 트리거(또는 별도 cron)한다. daily-report cron과 동일하게 CRON_SECRET을
// timing-safe하게 검증해 외부의 임의 호출을 막는다.
//
// 부분 실패: Slack을 쓰지 않으므로 "보낸 메시지 편집" 문제가 없다. 동기화는 멱등(full-replace)
// 이라 실패해도 재트리거 시 항상 DB 데모 set과 일치로 수렴한다. 실패는 500 + JSON으로 명시한다.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron ledger-sync] CRON_SECRET 미설정");
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
    const result = await syncReservationLedger();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron ledger-sync] failed", error);
    return Response.json(
      { ok: false, message: "예약 원장 동기화에 실패했습니다." },
      { status: 500 },
    );
  }
}
