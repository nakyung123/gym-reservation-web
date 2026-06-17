import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// googleapis + prisma를 모킹해 DB/네트워크 없이 집계·행 매핑·mirror·서식 호출을 검증한다.
// vi.mock은 hoist되므로 팩토리가 참조하는 mock 함수는 vi.hoisted로 함께 hoist한다.
const {
  valuesUpdate,
  valuesClear,
  spreadsheetsGet,
  batchUpdate,
  reservationFindMany,
  gymFindMany,
} = vi.hoisted(() => ({
  valuesUpdate: vi.fn(),
  valuesClear: vi.fn(),
  spreadsheetsGet: vi.fn(),
  batchUpdate: vi.fn(),
  reservationFindMany: vi.fn(),
  gymFindMany: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: class {} },
    sheets: () => ({
      spreadsheets: {
        get: spreadsheetsGet,
        batchUpdate,
        values: { update: valuesUpdate, clear: valuesClear },
      },
    }),
  },
}));

vi.mock("@/lib/server/prisma-client", () => ({
  prisma: {
    reservation: { findMany: reservationFindMany },
    gym: { findMany: gymFindMany },
  },
}));

import {
  buildDetailRows,
  buildSummaryRows,
  computeLedgerSummary,
  syncReservationLedger,
  type LedgerReservation,
} from "@/lib/server/sheets-ledger";

function reservation(over: Partial<LedgerReservation>): LedgerReservation {
  return {
    id: "demo-rev-x",
    date: "2026-05-01",
    gymName: "강남장",
    sport: "배드민턴",
    status: "used",
    price: 10000,
    ...over,
  };
}

describe("computeLedgerSummary", () => {
  it("KPI·월별(MoM)·시설/종목 비중을 분모 A(전체)로 집계한다", () => {
    const summary = computeLedgerSummary([
      reservation({ date: "2026-05-02", status: "used", price: 10000 }),
      reservation({ date: "2026-05-10", status: "cancelled", price: 10000 }),
      reservation({ date: "2026-06-02", status: "used", price: 20000 }),
      reservation({ date: "2026-06-20", status: "reserved", price: 10000 }),
    ]);

    expect(summary.totalCount).toBe(4);
    expect(summary.usedCount).toBe(2);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.bookedValue).toBe(50000); // 전체 price 합(취소 포함) = 분모 A
    expect(summary.settledValue).toBe(30000); // used만
    expect(summary.settlementRate).toBeCloseTo(0.6); // 30000/50000
    expect(summary.usageConversion).toBeCloseTo(2 / 3); // used/(used+cancelled)
    expect(summary.cancelRate).toBeCloseTo(0.25); // 1/4
    expect(summary.avgSettledPrice).toBe(15000); // 30000/2

    expect(summary.monthly).toHaveLength(2);
    expect(summary.monthly[0].momChange).toBeNull(); // 첫 월
    expect(summary.monthly[1].settledValue).toBe(20000);
    expect(summary.monthly[1].momChange).toBeCloseTo(1.0); // (20000-10000)/10000
    expect(summary.byGym[0].share).toBeCloseTo(1.0);
  });

  it("0건이어도 NaN 없이 0으로 가드한다", () => {
    const summary = computeLedgerSummary([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.settlementRate).toBe(0);
    expect(summary.usageConversion).toBe(0);
    expect(summary.avgSettledPrice).toBe(0);
    expect(summary.monthly).toEqual([]);
  });
});

describe("buildDetailRows", () => {
  it("월 컬럼을 넣고 서비스일 오름차순, 정산액은 used만 price", () => {
    const rows = buildDetailRows([
      reservation({ id: "demo-rev-b", date: "2026-06-01", status: "reserved", price: 12000 }),
      reservation({ id: "demo-rev-a", date: "2026-05-01", status: "used", price: 12000 }),
    ]);
    // rows[0]=헤더
    expect(rows[0]).toContain("월");
    expect(rows[0]).toContain("정산액(데모, used기준)");
    // 정렬: 2026-05-01(a)이 먼저
    expect(rows[1][0]).toBe("demo-rev-a");
    expect(rows[1][2]).toBe("2026-05"); // 월
    expect(rows[1][7]).toBe(12000); // used → 정산액
    expect(rows[2][0]).toBe("demo-rev-b");
    expect(rows[2][7]).toBe(0); // reserved → 0
  });
});

describe("buildSummaryRows", () => {
  it("섹션과 KPI를 담고 '매출'·'수금액'은 쓰지 않는다", () => {
    const rows = buildSummaryRows(
      computeLedgerSummary([reservation({ status: "used", price: 10000 })]),
    );
    const text = rows.flat().join(" ");
    expect(text).toContain("정산 요약(데모)");
    expect(text).toContain("[핵심 지표]");
    expect(text).toContain("[월별]");
    expect(text).toContain("[시설별]");
    expect(text).toContain("[종목별]");
    expect(text).toContain("정산률");
    expect(text).not.toContain("매출");
    expect(text).not.toContain("수금액");
  });
});

describe("syncReservationLedger", () => {
  const ORIGINAL = {
    id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };

  function metaResponse(
    tabs: { title: string; sheetId: number; cf?: number }[],
  ) {
    return {
      data: {
        sheets: tabs.map((t) => ({
          properties: { sheetId: t.sheetId, title: t.title },
          conditionalFormats: Array.from({ length: t.cf ?? 0 }, () => ({})),
        })),
      },
    };
  }

  beforeEach(() => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-123";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@demo.iam.gserviceaccount.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN-----\\nKEY\\n-----END-----";
    valuesUpdate.mockResolvedValue({});
    valuesClear.mockResolvedValue({});
    batchUpdate.mockResolvedValue({});
    reservationFindMany.mockResolvedValue([]);
    gymFindMany.mockResolvedValue([]);
    spreadsheetsGet.mockResolvedValue(
      metaResponse([
        { title: "정산 요약(데모)", sheetId: 11 },
        { title: "예약원장(데모)", sheetId: 22 },
      ]),
    );
  });

  afterEach(() => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = ORIGINAL.id;
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = ORIGINAL.email;
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = ORIGINAL.key;
    vi.clearAllMocks();
  });

  it("환경변수가 없으면 throw한다", async () => {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    await expect(syncReservationLedger()).rejects.toThrow();
    expect(valuesUpdate).not.toHaveBeenCalled();
  });

  it("두 탭을 각각 clear(A:Z)→update하고 서식 batchUpdate를 1회 호출한다", async () => {
    reservationFindMany.mockResolvedValue([
      {
        id: "demo-rev-a",
        date: "2026-06-01",
        gymId: "g1",
        sport: "배드민턴",
        status: "used",
        price: 12000,
      },
    ]);
    gymFindMany.mockResolvedValue([{ id: "g1", name: "강남장" }]);

    const result = await syncReservationLedger();

    // 두 탭 mirror: clear 2회(전체 열) + update 2회
    expect(valuesClear).toHaveBeenCalledTimes(2);
    expect(valuesUpdate).toHaveBeenCalledTimes(2);
    const clearRanges = valuesClear.mock.calls.map((c) => c[0].range);
    expect(clearRanges).toContain("'정산 요약(데모)'!A:Z");
    expect(clearRanges).toContain("'예약원장(데모)'!A:Z");

    // 탭이 이미 있으므로 addSheet 없이 서식 batchUpdate만 1회
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const requests = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(requests.some((r: { updateSheetProperties?: unknown }) => r.updateSheetProperties)).toBe(true);
    expect(requests.some((r: { repeatCell?: unknown }) => r.repeatCell)).toBe(true);
    expect(requests.some((r: { addConditionalFormatRule?: unknown }) => r.addConditionalFormatRule)).toBe(true);

    expect(result.reservations).toBe(1);
  });

  it("탭이 없으면 생성(addSheet)한 뒤 서식까지 적용한다", async () => {
    // 1차 조회: 요약 탭만 존재 → 상세 탭 생성 → 2차 조회: 둘 다 존재
    spreadsheetsGet
      .mockResolvedValueOnce(metaResponse([{ title: "정산 요약(데모)", sheetId: 11 }]))
      .mockResolvedValueOnce(
        metaResponse([
          { title: "정산 요약(데모)", sheetId: 11 },
          { title: "예약원장(데모)", sheetId: 22 },
        ]),
      );

    await syncReservationLedger();

    // addSheet batchUpdate + 서식 batchUpdate = 2회, get 2회
    expect(spreadsheetsGet).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const firstRequests = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(firstRequests.some((r: { addSheet?: unknown }) => r.addSheet)).toBe(true);
  });
});
