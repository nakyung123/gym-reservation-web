import "server-only";
import { notifySlack } from "@/lib/server/notify-slack";

// 예약 이벤트(생성/취소) 즉시 Slack 알림(레이어2 이벤트). 일일 리포트(레이어1)의
// notify-slack 헬퍼를 그대로 재사용한다.
//
// 사이드이펙트 격리(best-effort): 알림은 예약 본 흐름의 "부수효과"이므로, 전송 실패가
// 예약 생성/취소 응답을 절대 깨면 안 된다. db-audit-repository의 safeRecordAuditLog와
// 같은 철학 — 실패는 throw하지 않고 로그만 남긴다.
//
// PII 미포함: 사용자 식별자/이름/이메일은 메시지에 넣지 않고 예약 슬롯 정보만 게시한다.
// (시설명은 호출부가 넘긴다. 취소 경로는 best-effort로 조회해 넘기고, 못 구하면 gymId로 폴백.)

type ReservationEventKind = "created" | "cancelled";

export type ReservationEventInput = {
  kind: ReservationEventKind;
  gymName: string;
  sport: string;
  date: string;
  time: string;
};

export function buildReservationEventText(input: ReservationEventInput): string {
  const slot = `${input.gymName} · ${input.sport} · ${input.date} ${input.time}`;
  return input.kind === "created"
    ? `🆕 새 예약: ${slot}`
    : `❌ 예약 취소: ${slot}`;
}

export async function notifyReservationEvent(
  input: ReservationEventInput,
): Promise<void> {
  try {
    await notifySlack(buildReservationEventText(input));
  } catch (error) {
    console.error(
      "[reservation-notify] Slack 알림 실패(예약 흐름엔 영향 없음)",
      error,
    );
  }
}
