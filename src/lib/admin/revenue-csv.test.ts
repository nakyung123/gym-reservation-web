import { describe, expect, it } from "vitest";
import type { GymRevenueRow, RevenueSummary } from "@/lib/admin/revenue";
import { revenueCsvFilename, toRevenueCsv } from "@/lib/admin/revenue-csv";

function gymRow(gymName: string, over: Partial<GymRevenueRow> = {}): GymRevenueRow {
  return {
    gymId: gymName,
    gymName,
    counts: { total: 0, reserved: 0, cancelled: 0, used: 0 },
    revenue: { expected: 0, used: 0 },
    ...over,
  };
}

function summary(over: Partial<RevenueSummary> = {}): RevenueSummary {
  return {
    from: "2026-06-01",
    to: "2026-06-30",
    counts: { total: 3, reserved: 1, cancelled: 1, used: 1 },
    revenue: { expected: 24000, used: 12000 },
    gyms: [
      gymRow("테스트 체육관", {
        counts: { total: 3, reserved: 1, cancelled: 1, used: 1 },
        revenue: { expected: 24000, used: 12000 },
      }),
    ],
    ...over,
  };
}

function bodyLines(csv: string): string[] {
  return csv.replace(/^﻿/, "").replace(/\r\n$/, "").split("\r\n");
}

describe("toRevenueCsv", () => {
  it("BOM으로 시작하고 헤더·시설행·합계행을 CRLF로 구성한다", () => {
    const csv = toRevenueCsv(summary());

    expect(csv.startsWith("﻿")).toBe(true);
    const lines = bodyLines(csv);
    expect(lines[0]).toBe(
      "시설,예약 완료,이용 완료,예약 취소,전망 (예약+이용),정산 기준 (이용완료)",
    );
    expect(lines[1]).toBe("테스트 체육관,1,1,1,24000,12000");
    expect(lines[2]).toBe("합계,1,1,1,24000,12000");
  });

  it("수식 인젝션 문자(=,+,-,@)로 시작하는 시설명을 작은따옴표로 무력화한다", () => {
    const csv = toRevenueCsv(
      summary({
        gyms: [gymRow("=1+1"), gymRow("@SUM(1)"), gymRow("-5"), gymRow("+9")],
      }),
    );
    const lines = bodyLines(csv);

    expect(lines[1].startsWith("'=1+1,")).toBe(true);
    expect(lines[2].startsWith("'@SUM(1),")).toBe(true);
    expect(lines[3].startsWith("'-5,")).toBe(true);
    expect(lines[4].startsWith("'+9,")).toBe(true);
  });

  it("쉼표·따옴표가 포함된 시설명을 표준 CSV로 escape한다", () => {
    const csv = toRevenueCsv(
      summary({ gyms: [gymRow("좋은짐, 강남"), gymRow('따옴표"짐')] }),
    );
    const lines = bodyLines(csv);

    expect(lines[1].startsWith('"좋은짐, 강남",')).toBe(true);
    // 내부 따옴표는 두 번으로 escape.
    expect(lines[2].startsWith('"따옴표""짐",')).toBe(true);
  });

  it("파일명은 기간을 포함한다", () => {
    expect(revenueCsvFilename(summary())).toBe("revenue_2026-06-01_2026-06-30.csv");
  });
});
