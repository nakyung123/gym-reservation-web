import "server-only";

// Slack Incoming Webhook으로 텍스트 메시지를 보내는 공용 헬퍼.
// 일일 리포트 cron(레이어1)과 이후 이벤트 알림(예약/취소)에서 함께 재사용한다.
//
// SLACK_WEBHOOK_URL은 서버 전용 설정값이다. 누락 시 조용한 fallback 없이 명시적으로 throw한다.
// (말없이 성공처럼 처리하면 "알림이 안 왔는데 ok로 보이는" 부분 실패가 된다.)

// Slack 응답이 느리거나 행(hang)일 때 호출부를 무한정 막지 않도록 타임아웃을 둔다.
// best-effort catch는 "에러"는 막지만 "지연"은 못 막으므로, 여기서 시간 자체를 bound한다.
const SLACK_TIMEOUT_MS = 3000;

export async function notifySlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error(
      "[notify-slack] SLACK_WEBHOOK_URL이 설정되어 있지 않습니다.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 비밀(webhook URL)은 메시지에 포함하지 않는다. 상태코드만 노출.
      throw new Error(`[notify-slack] Slack 전송 실패: HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
