import { buildDailyReport } from "@/lib/server/daily-report";
import { notifySlack } from "@/lib/server/notify-slack";
import { safeEqualToken } from "@/lib/server/oauth/oauth-state";

export const dynamic = "force-dynamic";

// 일일 운영 리포트 cron 엔드포인트.
// Vercel Cron(vercel.json)이 매일 UTC 00:00(=KST 09:00)에 GET으로 호출한다.
// CRON_SECRET이 설정돼 있으면 Vercel이 Authorization: Bearer <CRON_SECRET>를 붙여 보내므로
// 그 헤더를 timing-safe하게 검증해 외부의 임의 트리거를 막는다.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron daily-report] CRON_SECRET 미설정");
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
    const { data, text } = await buildDailyReport({ now: new Date() });
    // 부분 실패를 성공으로 위장하지 않는다: Slack 전송이 실패하면 아래 catch에서 500으로 응답한다.
    await notifySlack(text);
    return Response.json({ ok: true, date: data.yesterdayKstDate });
  } catch (error) {
    console.error("[cron daily-report] failed", error);
    return Response.json(
      { ok: false, message: "일일 리포트 전송에 실패했습니다." },
      { status: 500 },
    );
  }
}
