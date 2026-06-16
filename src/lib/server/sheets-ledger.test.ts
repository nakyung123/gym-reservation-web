import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// googleapis + prisma를 모킹해 DB/네트워크 없이 순수 행 매핑과 full-replace 동작을 검증한다.
// vitest.unit.config.ts include 대상.
// vi.mock은 파일 최상단으로 hoist되므로, 팩토리가 참조하는 mock 함수는 vi.hoisted로 함께 hoist한다.
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
  buildLedgerRows,
  syncReservationLedger,
  type LedgerReservation,
} from "@/lib/server/sheets-ledger";

describe("buildLedgerRows", () => {
  const base: Omit<LedgerReservation, "status"> = {
    id: "demo-rev-1",
    date: "2026-06-01",
    gymName: "강남 체육관",
    sport: "배드민턴",
    price: 12000,
  };

  it("정산액은 status=used면 price, 그 외엔 0이다", () => {
    const rows = buildLedgerRows([
      { ...base, status: "used" },
      { ...base, status: "reserved" },
      { ...base, status: "cancelled" },
    ]);
    // rows[0]=공지, rows[1]=헤더, rows[2..]=데이터
    expect(rows[2][6]).toBe(12000); // used → price
    expect(rows[3][6]).toBe(0); // reserved → 0
    expect(rows[4][6]).toBe(0); // cancelled → 0
    // 예약가치(price)는 status 무관하게 그대로.
    expect(rows[2][5]).toBe(12000);
  });

  it("공지/헤더에 '매출'·'수금액' 라벨을 쓰지 않는다(규율 승계)", () => {
    const text = buildLedgerRows([]).flat().join(" ");
    expect(text).not.toContain("매출");
    expect(text).not.toContain("수금액");
    expect(text).toContain("데모"); // 데모 고지 존재
  });
});

describe("syncReservationLedger", () => {
  const ORIGINAL = {
    id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };

  beforeEach(() => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-123";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@demo.iam.gserviceaccount.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN-----\\nKEY\\n-----END-----";
    valuesUpdate.mockResolvedValue({});
    valuesClear.mockResolvedValue({});
    batchUpdate.mockResolvedValue({});
    reservationFindMany.mockResolvedValue([]);
    gymFindMany.mockResolvedValue([]);
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [] } });
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

  it("탭이 없으면 생성하고, 데모 예약을 정산액과 함께 full-replace한다", async () => {
    spreadsheetsGet.mockResolvedValue({ data: { sheets: [] } }); // 탭 없음
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
    gymFindMany.mockResolvedValue([{ id: "g1", name: "강남 체육관" }]);

    const result = await syncReservationLedger();

    // 탭 생성됨
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    // 탭명 괄호 → 작은따옴표 인용
    const updateArg = valuesUpdate.mock.calls[0][0];
    expect(updateArg.range).toContain("'예약원장(데모)'");
    // 데이터 행: gymId가 시설명으로 치환 + 정산액(used)=price
    const values = updateArg.requestBody.values;
    expect(values[values.length - 1]).toEqual([
      "demo-rev-a",
      "2026-06-01",
      "강남 체육관",
      "배드민턴",
      "used",
      12000,
      12000,
    ]);
    // update-then-clear: 잔여행 clear 호출
    expect(valuesClear).toHaveBeenCalledTimes(1);
    expect(valuesClear.mock.calls[0][0].range).toContain("'예약원장(데모)'");
    expect(result.reservations).toBe(1);
  });

  it("탭이 이미 있으면 생성하지 않는다", async () => {
    spreadsheetsGet.mockResolvedValue({
      data: { sheets: [{ properties: { title: "예약원장(데모)" } }] },
    });
    await syncReservationLedger();
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
  });
});
