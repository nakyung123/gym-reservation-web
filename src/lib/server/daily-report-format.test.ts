import { describe, expect, it } from "vitest";
import {
  buildDailyReportText,
  kstTodayDateString,
  kstYesterdayUtcRange,
  type DailyReportData,
} from "@/lib/server/daily-report-format";

// DB 없는 순수 함수 테스트. vitest.unit.config.ts include 대상.

describe("kstYesterdayUtcRange", () => {
  it("KST 정오 기준 어제 하루를 UTC 반열린 구간으로 변환한다", () => {
    // 2026-06-16T03:00Z = KST 2026-06-16 12:00 → 어제(KST) = 2026-06-15
    const range = kstYesterdayUtcRange(new Date("2026-06-16T03:00:00.000Z"));
    expect(range.startUtc.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    expect(range.endUtc.toISOString()).toBe("2026-06-15T15:00:00.000Z");
    expect(range.dateLabel).toBe("2026-06-15");
  });

  it("KST 자정 직후 경계에서 어제가 하루 당겨지지 않는다", () => {
    // 2026-06-15T15:00Z = KST 2026-06-16 00:00 (자정) → 어제 = 2026-06-15
    const range = kstYesterdayUtcRange(new Date("2026-06-15T15:00:00.000Z"));
    expect(range.startUtc.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    expect(range.endUtc.toISOString()).toBe("2026-06-15T15:00:00.000Z");
    expect(range.dateLabel).toBe("2026-06-15");
  });

  it("KST 자정 직전 경계에서는 어제가 하루 전이다", () => {
    // 2026-06-15T14:59:59.999Z = KST 2026-06-15 23:59:59.999 → 어제 = 2026-06-14
    const range = kstYesterdayUtcRange(
      new Date("2026-06-15T14:59:59.999Z"),
    );
    expect(range.endUtc.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    expect(range.dateLabel).toBe("2026-06-14");
  });
});

describe("kstTodayDateString", () => {
  it("UTC instant를 KST 날짜로 변환한다", () => {
    expect(kstTodayDateString(new Date("2026-06-16T03:00:00.000Z"))).toBe(
      "2026-06-16",
    );
    // KST 자정 직전(UTC 14:59)은 아직 같은 KST 날짜.
    expect(kstTodayDateString(new Date("2026-06-15T14:59:59.999Z"))).toBe(
      "2026-06-15",
    );
  });
});

const SAMPLE: DailyReportData = {
  yesterdayKstDate: "2026-06-15",
  todayKstDate: "2026-06-16",
  newReservations: 12,
  bookedValueWon: 148000,
  newSignups: 3,
  newFavorites: 5,
  withdrawals: 1,
  todayReservedCount: 8,
};

describe("buildDailyReportText", () => {
  it("지표를 한국어 메시지로 만들고 '예약가치' 라벨을 쓴다", () => {
    const text = buildDailyReportText(SAMPLE);
    expect(text).toContain("2026-06-15");
    expect(text).toContain("신규 예약: 12건");
    expect(text).toContain("예약가치 148,000원");
    expect(text).toContain("수금액 아님");
    expect(text).toContain("신규 가입: 3명");
    expect(text).toContain("신규 즐겨찾기: 5건");
    expect(text).toContain("탈퇴: 1명");
    expect(text).toContain("오늘(2026-06-16) 예약 일정: 8건");
  });

  it("매출/정산을 매출이라 부르지 않는다(라벨 오용 방지)", () => {
    expect(buildDailyReportText(SAMPLE)).not.toContain("매출");
  });

  it("활동이 0인 날도 깨지지 않고 '활동 없음'을 명시한다", () => {
    const empty: DailyReportData = {
      yesterdayKstDate: "2026-06-15",
      todayKstDate: "2026-06-16",
      newReservations: 0,
      bookedValueWon: 0,
      newSignups: 0,
      newFavorites: 0,
      withdrawals: 0,
      todayReservedCount: 0,
    };
    const text = buildDailyReportText(empty);
    expect(text).toContain("신규 예약: 0건");
    expect(text).toContain("예약가치 0원");
    expect(text).toContain("어제는 신규 활동이 없었습니다.");
  });
});
