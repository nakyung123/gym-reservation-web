import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReservationEventText,
  notifyReservationEvent,
} from "@/lib/server/reservation-notify";
import { notifySlack } from "@/lib/server/notify-slack";

// notify-slack(fetch 의존)을 모킹해 DB/네트워크 없이 메시지 빌더와 best-effort 격리를 검증한다.
// vitest.unit.config.ts include 대상.
vi.mock("@/lib/server/notify-slack", () => ({ notifySlack: vi.fn() }));

describe("buildReservationEventText", () => {
  it("생성 이벤트를 슬롯 정보로 만든다(PII 없음)", () => {
    const text = buildReservationEventText({
      kind: "created",
      gymName: "강남 배드민턴장",
      sport: "배드민턴",
      date: "2026-06-20",
      time: "14:00",
    });
    expect(text).toBe(
      "🆕 새 예약: 강남 배드민턴장 · 배드민턴 · 2026-06-20 14:00",
    );
  });

  it("취소 이벤트 라벨을 쓴다", () => {
    const text = buildReservationEventText({
      kind: "cancelled",
      gymName: "강남 배드민턴장",
      sport: "농구",
      date: "2026-06-20",
      time: "14:00",
    });
    expect(text).toBe("❌ 예약 취소: 강남 배드민턴장 · 농구 · 2026-06-20 14:00");
  });
});

describe("notifyReservationEvent", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("이벤트 텍스트로 notifySlack을 호출한다", async () => {
    vi.mocked(notifySlack).mockResolvedValue(undefined);
    await notifyReservationEvent({
      kind: "created",
      gymName: "G",
      sport: "배드민턴",
      date: "2026-06-20",
      time: "14:00",
    });
    expect(notifySlack).toHaveBeenCalledWith(
      "🆕 새 예약: G · 배드민턴 · 2026-06-20 14:00",
    );
  });

  it("Slack 전송이 실패해도 throw하지 않는다(best-effort 격리)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(notifySlack).mockRejectedValue(new Error("down"));
    await expect(
      notifyReservationEvent({
        kind: "cancelled",
        gymName: "G",
        sport: "농구",
        date: "2026-06-20",
        time: "14:00",
      }),
    ).resolves.toBeUndefined();
  });
});
