import "server-only";
import { google, type sheets_v4 } from "googleapis";
import { prisma } from "@/lib/server/prisma-client";
import { DEMO_RESERVATION_ID_PREFIX } from "@/lib/domain-constants";

// Phase 4 / 4.1: 데모 예약을 Google Sheets "정산 원장"으로 적재하는 모듈.
//
// 구성(벤치마크: 요약 대시보드 + 상세 원장 분리):
//   - 탭 `정산 요약(데모)`: KPI 카드 + 월별/시설별/종목별 롤업(코드가 집계해 기록).
//   - 탭 `예약원장(데모)`: 거래 1행/예약 상세(헤더 고정·볼드·천단위·상태색).
//
// 정직성: 결제·체크인 연동이 없으므로 실매출/실정산이 아니라 데모(목업)다. 정산액은 기존 admin
// usedRevenue와 동일하게 status==="used"를 "정산 대상" 프록시로 쓴다(스키마 변경 0). 시트 문구엔
// "데모/실제 결제·정산 아님"을 명시하고 "매출/수금액" 단어는 쓰지 않는다(Phase1~3 규율 승계).
//
// 격리: 데모 예약(id prefix demo-rev-)만 읽는다. 운영 리포트(daily-report.ts)는 반대로 제외한다.
// 멱등: 두 탭 모두 full-replace(mirror, clear-then-update + 전체 열). 조건부서식도 매 동기화에
//       기존 룰 삭제 후 재추가해 누적되지 않게 한다.

const SUMMARY_TAB = "정산 요약(데모)";
const DETAIL_TAB = "예약원장(데모)";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const DETAIL_HEADER = [
  "예약ID",
  "서비스일",
  "월",
  "시설",
  "종목",
  "상태",
  "예약가치(원)",
  "정산액(데모, used기준)",
];

export type LedgerReservation = {
  id: string;
  date: string;
  gymName: string;
  sport: string;
  status: string;
  price: number;
};

export type MonthlyRow = {
  month: string;
  count: number;
  bookedValue: number;
  settledValue: number;
  settlementRate: number;
  // 직전(데이터가 있는) 월의 정산액 대비 증감률. 첫 월은 null.
  momChange: number | null;
};
export type GymRow = {
  gymName: string;
  count: number;
  bookedValue: number;
  settledValue: number;
  share: number;
};
export type SportRow = { sport: string; settledValue: number; share: number };

export type LedgerSummary = {
  periodFrom: string;
  periodTo: string;
  totalCount: number;
  usedCount: number;
  reservedCount: number;
  cancelledCount: number;
  bookedValue: number; // Σ price(전체, 취소 포함) = 정산률 분모 A
  settledValue: number; // Σ price(status=used)
  settlementRate: number; // settledValue / bookedValue
  usageConversion: number; // used / (used + cancelled)
  cancelRate: number; // cancelled / total
  avgSettledPrice: number; // settledValue / usedCount
  monthly: MonthlyRow[];
  byGym: GymRow[];
  bySport: SportRow[];
};

function formatWon(won: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(won))}원`;
}
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
function signedPct(fraction: number | null): string {
  if (fraction === null) return "-";
  const value = (fraction * 100).toFixed(1);
  return fraction >= 0 ? `+${value}%` : `${value}%`;
}

// 거래 배열 → 집계(KPI + 월별/시설별/종목별). 순수 함수. 0건/0원 분모는 0으로 가드한다.
export function computeLedgerSummary(
  reservations: LedgerReservation[],
): LedgerSummary {
  let usedCount = 0;
  let reservedCount = 0;
  let cancelledCount = 0;
  let bookedValue = 0;
  let settledValue = 0;
  let periodFrom = "";
  let periodTo = "";

  const monthlyMap = new Map<
    string,
    { count: number; bookedValue: number; settledValue: number }
  >();
  const gymMap = new Map<
    string,
    { count: number; bookedValue: number; settledValue: number }
  >();
  const sportMap = new Map<string, { settledValue: number }>();

  for (const reservation of reservations) {
    const settled = reservation.status === "used" ? reservation.price : 0;
    bookedValue += reservation.price;
    settledValue += settled;
    if (reservation.status === "used") usedCount += 1;
    else if (reservation.status === "reserved") reservedCount += 1;
    else if (reservation.status === "cancelled") cancelledCount += 1;

    if (periodFrom === "" || reservation.date < periodFrom)
      periodFrom = reservation.date;
    if (periodTo === "" || reservation.date > periodTo)
      periodTo = reservation.date;

    const month = reservation.date.slice(0, 7);
    const m = monthlyMap.get(month) ?? {
      count: 0,
      bookedValue: 0,
      settledValue: 0,
    };
    m.count += 1;
    m.bookedValue += reservation.price;
    m.settledValue += settled;
    monthlyMap.set(month, m);

    const g = gymMap.get(reservation.gymName) ?? {
      count: 0,
      bookedValue: 0,
      settledValue: 0,
    };
    g.count += 1;
    g.bookedValue += reservation.price;
    g.settledValue += settled;
    gymMap.set(reservation.gymName, g);

    const s = sportMap.get(reservation.sport) ?? { settledValue: 0 };
    s.settledValue += settled;
    sportMap.set(reservation.sport, s);
  }

  const totalCount = reservations.length;
  const monthly: MonthlyRow[] = [...monthlyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value], index, arr) => {
      const prev = index > 0 ? arr[index - 1][1].settledValue : null;
      const momChange =
        prev !== null && prev > 0 ? (value.settledValue - prev) / prev : null;
      return {
        month,
        count: value.count,
        bookedValue: value.bookedValue,
        settledValue: value.settledValue,
        settlementRate:
          value.bookedValue > 0 ? value.settledValue / value.bookedValue : 0,
        momChange,
      };
    });

  const byGym: GymRow[] = [...gymMap.entries()]
    .map(([gymName, value]) => ({
      gymName,
      count: value.count,
      bookedValue: value.bookedValue,
      settledValue: value.settledValue,
      share: settledValue > 0 ? value.settledValue / settledValue : 0,
    }))
    .sort((a, b) => b.settledValue - a.settledValue);

  const bySport: SportRow[] = [...sportMap.entries()]
    .map(([sport, value]) => ({
      sport,
      settledValue: value.settledValue,
      share: settledValue > 0 ? value.settledValue / settledValue : 0,
    }))
    .sort((a, b) => b.settledValue - a.settledValue);

  return {
    periodFrom,
    periodTo,
    totalCount,
    usedCount,
    reservedCount,
    cancelledCount,
    bookedValue,
    settledValue,
    settlementRate: bookedValue > 0 ? settledValue / bookedValue : 0,
    usageConversion:
      usedCount + cancelledCount > 0
        ? usedCount / (usedCount + cancelledCount)
        : 0,
    cancelRate: totalCount > 0 ? cancelledCount / totalCount : 0,
    avgSettledPrice: usedCount > 0 ? settledValue / usedCount : 0,
    monthly,
    byGym,
    bySport,
  };
}

// 요약(대시보드) 탭의 2차원 값 배열. 금액/비율은 가독성 위해 포맷 문자열로 쓴다(읽기 전용 대시보드).
export function buildSummaryRows(
  summary: LedgerSummary,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push([
    `정산 요약(데모) · 기간 ${summary.periodFrom || "-"} ~ ${summary.periodTo || "-"} · 실제 결제·정산 아님(used=정산 프록시)`,
  ]);
  rows.push([]);
  rows.push(["[핵심 지표]"]);
  rows.push(["총 예약", summary.totalCount, "총 예약가치", formatWon(summary.bookedValue)]);
  rows.push([
    "이용완료(정산대상)",
    summary.usedCount,
    "총 정산액(데모)",
    formatWon(summary.settledValue),
  ]);
  rows.push([
    "예약 / 취소",
    `${summary.reservedCount} / ${summary.cancelledCount}`,
    "정산률",
    pct(summary.settlementRate),
  ]);
  rows.push([
    "이용 전환율",
    pct(summary.usageConversion),
    "취소율",
    pct(summary.cancelRate),
  ]);
  rows.push(["객단가(정산)", formatWon(summary.avgSettledPrice)]);
  rows.push([]);
  rows.push(["[월별]"]);
  rows.push(["월", "예약건수", "예약가치", "정산액(used)", "정산률", "전월대비(정산액)"]);
  for (const m of summary.monthly) {
    rows.push([
      m.month,
      m.count,
      formatWon(m.bookedValue),
      formatWon(m.settledValue),
      pct(m.settlementRate),
      signedPct(m.momChange),
    ]);
  }
  rows.push([]);
  rows.push(["[시설별]"]);
  rows.push(["시설", "예약건수", "예약가치", "정산액(used)", "비중"]);
  for (const g of summary.byGym) {
    rows.push([
      g.gymName,
      g.count,
      formatWon(g.bookedValue),
      formatWon(g.settledValue),
      pct(g.share),
    ]);
  }
  rows.push([]);
  rows.push(["[종목별]"]);
  rows.push(["종목", "정산액(used)", "비중"]);
  for (const s of summary.bySport) {
    rows.push([s.sport, formatWon(s.settledValue), pct(s.share)]);
  }
  return rows;
}

// 상세(거래 원장) 탭의 2차원 값 배열. 헤더 + 서비스일 오름차순 데이터. 금액은 숫자(서식 적용 대상).
export function buildDetailRows(
  reservations: LedgerReservation[],
): (string | number)[][] {
  const sorted = [...reservations].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
  );
  const dataRows: (string | number)[][] = sorted.map((reservation) => [
    reservation.id,
    reservation.date,
    reservation.date.slice(0, 7),
    reservation.gymName,
    reservation.sport,
    reservation.status,
    reservation.price,
    reservation.status === "used" ? reservation.price : 0,
  ]);
  return [DETAIL_HEADER, ...dataRows];
}

// A1 표기에서 탭명 특수문자(괄호/공백)는 작은따옴표로 감싼다(내부 ' 는 '' 이스케이프).
function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

function getSheetsClient() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      // env에 \n 리터럴로 이스케이프된 키를 실제 개행으로 되돌린다.
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: [SHEETS_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, spreadsheetId };
}

type SheetMeta = { sheetId: number; conditionalFormatCount: number };

// 필요한 탭이 없으면 만들고, 각 탭의 sheetId와 기존 조건부서식 룰 수를 돌려준다(서식 멱등용).
async function ensureTabsAndMeta(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  titles: string[],
): Promise<Map<string, SheetMeta>> {
  const fetchMeta = async (): Promise<Map<string, SheetMeta>> => {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title),conditionalFormats)",
    });
    const map = new Map<string, SheetMeta>();
    for (const sheet of meta.data.sheets ?? []) {
      const title = sheet.properties?.title;
      const sheetId = sheet.properties?.sheetId;
      if (title != null && sheetId != null) {
        map.set(title, {
          sheetId,
          conditionalFormatCount: (sheet.conditionalFormats ?? []).length,
        });
      }
    }
    return map;
  };

  let map = await fetchMeta();
  const toCreate = titles.filter((title) => !map.has(title));
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });
    map = await fetchMeta();
  }
  return map;
}

// 한 탭을 통째로 mirror한다: 기존 값을 전체 열(A:Z) clear → 새 행을 A1부터 update.
// 열 전체 범위 clear는 그리드 크기와 무관하게 항상 유효하다(데이터가 그리드를 꽉 채워도 안전).
async function mirrorTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string,
  rows: (string | number)[][],
): Promise<void> {
  const tab = quoteTab(tabTitle);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A:Z`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

// 서식 batchUpdate 요청 묶음. updateSheetProperties/repeatCell은 덮어쓰기라 멱등이고,
// 조건부서식만 누적되므로 기존 룰을 먼저 삭제한 뒤 재추가한다.
function buildFormatRequests(
  detail: SheetMeta,
  summary: SheetMeta,
): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];

  // 상세: 헤더 고정 + 볼드
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: detail.sheetId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId: detail.sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: DETAIL_HEADER.length,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  });
  // 상세: 금액 2열(예약가치=6, 정산액=7) 천단위 서식
  requests.push({
    repeatCell: {
      range: {
        sheetId: detail.sheetId,
        startRowIndex: 1,
        startColumnIndex: 6,
        endColumnIndex: 8,
      },
      cell: {
        userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  // 상세: 기존 조건부서식 제거(멱등) 후 상태색 재추가(used=초록, cancelled=회색)
  for (let i = 0; i < detail.conditionalFormatCount; i += 1) {
    requests.push({
      deleteConditionalFormatRule: { sheetId: detail.sheetId, index: 0 },
    });
  }
  const statusRange: sheets_v4.Schema$GridRange = {
    sheetId: detail.sheetId,
    startRowIndex: 1,
    startColumnIndex: 5,
    endColumnIndex: 6,
  };
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [statusRange],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "used" }] },
          format: { backgroundColor: { red: 0.85, green: 0.94, blue: 0.83 } },
        },
      },
      index: 0,
    },
  });
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [statusRange],
        booleanRule: {
          condition: {
            type: "TEXT_EQ",
            values: [{ userEnteredValue: "cancelled" }],
          },
          format: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 } },
        },
      },
      index: 0,
    },
  });

  // 요약: 제목행 고정 + 볼드
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: summary.sheetId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId: summary.sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 6,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  });

  return requests;
}

export type LedgerSyncResult = {
  reservations: number;
  detailRows: number;
  summaryRows: number;
};

// 데모 예약을 읽어 요약+상세 두 탭을 mirror하고 서식을 적용한다. 실패 시 throw(route가 500).
export async function syncReservationLedger(): Promise<LedgerSyncResult> {
  const client = getSheetsClient();
  if (!client) {
    throw new Error(
      "[sheets-ledger] Google Sheets 환경변수(GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)가 설정되어 있지 않습니다.",
    );
  }
  const { sheets, spreadsheetId } = client;

  const [reservations, gyms] = await Promise.all([
    prisma.reservation.findMany({
      where: { id: { startsWith: DEMO_RESERVATION_ID_PREFIX } },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      select: {
        id: true,
        date: true,
        gymId: true,
        sport: true,
        status: true,
        price: true,
      },
    }),
    prisma.gym.findMany({ select: { id: true, name: true } }),
  ]);
  const gymNameById = new Map(gyms.map((gym) => [gym.id, gym.name]));
  const ledgerReservations: LedgerReservation[] = reservations.map(
    (reservation) => ({
      id: reservation.id,
      date: reservation.date,
      gymName: gymNameById.get(reservation.gymId) ?? reservation.gymId,
      sport: reservation.sport,
      status: reservation.status,
      price: reservation.price,
    }),
  );

  const summary = computeLedgerSummary(ledgerReservations);
  const summaryRows = buildSummaryRows(summary);
  const detailRows = buildDetailRows(ledgerReservations);

  const meta = await ensureTabsAndMeta(sheets, spreadsheetId, [
    SUMMARY_TAB,
    DETAIL_TAB,
  ]);
  const summaryMeta = meta.get(SUMMARY_TAB);
  const detailMeta = meta.get(DETAIL_TAB);
  if (!summaryMeta || !detailMeta) {
    throw new Error("[sheets-ledger] 원장 탭 생성/조회에 실패했습니다.");
  }

  await mirrorTab(sheets, spreadsheetId, SUMMARY_TAB, summaryRows);
  await mirrorTab(sheets, spreadsheetId, DETAIL_TAB, detailRows);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: buildFormatRequests(detailMeta, summaryMeta) },
  });

  return {
    reservations: ledgerReservations.length,
    detailRows: detailRows.length,
    summaryRows: summaryRows.length,
  };
}
