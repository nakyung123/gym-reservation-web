import "server-only";
import { google } from "googleapis";
import { prisma } from "@/lib/server/prisma-client";
import { DEMO_RESERVATION_ID_PREFIX } from "@/lib/domain-constants";

// Phase 4: 데모 예약을 Google Sheets "예약/정산 원장"에 적재하는 모듈.
//
// 정직성: 결제·체크인 연동이 없으므로 이건 실매출/실정산이 아니라 데모(목업)다. 정산액은
// 기존 admin 집계와 동일하게 status==="used"를 "정산 대상" 프록시로 쓴다(스키마 변경 0).
// 시트 공지/헤더에 "데모" 명시, "매출/수금액" 단어는 쓰지 않는다(Phase1~3 규율 승계).
//
// 격리: 데모 예약(id prefix demo-rev-)만 읽는다. 운영 리포트(daily-report.ts)는 반대로 이
// prefix를 제외한다 → 데모/운영 두 파이프가 겹치지 않는다.
//
// 멱등: full-replace(mirror). 데모 시드는 재실행마다 행을 전량 delete 후 새 random id로
// 재생성하므로 append-by-id는 옛 id가 유령으로 누적된다. 그래서 매 동기화에 데모 탭을 현재
// DB 데모 set으로 통째 덮어쓴다(orphan 0). 별도 탭이라 타 데이터에 영향 없다.

const LEDGER_TAB = "예약원장(데모)";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// 첫 행 공지(데모 고지). "매출/수금액" 금지.
export const LEDGER_NOTICE =
  "데모 데이터(목업) · 실제 결제·정산이 아닌 예약 기준 · 정산액은 status=used 프록시";
export const LEDGER_HEADER = [
  "예약ID",
  "서비스일",
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

// 거래 1행/예약 → 시트 2차원 값 배열(공지 + 헤더 + 데이터). 순수 함수(IO 없음).
// 정산액 = status==="used" ? price : 0 (admin usedRevenue 정의와 동일).
export function buildLedgerRows(
  reservations: LedgerReservation[],
): (string | number)[][] {
  const dataRows: (string | number)[][] = reservations.map((reservation) => [
    reservation.id,
    reservation.date,
    reservation.gymName,
    reservation.sport,
    reservation.status,
    reservation.price,
    reservation.status === "used" ? reservation.price : 0,
  ]);
  return [[LEDGER_NOTICE], LEDGER_HEADER, ...dataRows];
}

// A1 표기에서 탭명에 괄호/공백 등 특수문자가 있으면 작은따옴표로 감싼다(내부 ' 는 '' 로 이스케이프).
// 예: 예약원장(데모) → '예약원장(데모)'
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
      // env에 저장된 키는 줄바꿈이 \n 리터럴로 이스케이프돼 있으므로 실제 개행으로 되돌린다.
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: [SHEETS_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, spreadsheetId };
}

// 데모 탭이 없으면 만든다(첫 동기화). 있으면 아무것도 안 한다.
async function ensureLedgerTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some(
    (sheet) => sheet.properties?.title === LEDGER_TAB,
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: LEDGER_TAB } } }],
      },
    });
  }
}

export type LedgerSyncResult = {
  reservations: number;
  rowsWritten: number;
};

// 데모 예약을 읽어 데모 탭을 full-replace(mirror)한다. 실패 시 throw(호출측 route가 500으로 응답).
export async function syncReservationLedger(): Promise<LedgerSyncResult> {
  const client = getSheetsClient();
  if (!client) {
    throw new Error(
      "[sheets-ledger] Google Sheets 환경변수(GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)가 설정되어 있지 않습니다.",
    );
  }
  const { sheets, spreadsheetId } = client;

  // 데모 예약만 읽는다(운영 데이터와 격리). 시설명은 한 번에 map으로 조회(행마다 쿼리 안 함).
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
  const rows = buildLedgerRows(ledgerReservations);

  await ensureLedgerTab(sheets, spreadsheetId);

  const tab = quoteTab(LEDGER_TAB);
  // update-then-clear: 먼저 현재 행(공지+헤더+데이터)을 A1부터 덮어쓰고, 그 아래 이전 잔여행을
  // 지운다. (clear→update 순서는 쓰기 실패 시 빈 탭이 노출되므로 update를 먼저 한다.)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A${rows.length + 1}:G`,
  });

  return { reservations: ledgerReservations.length, rowsWritten: rows.length };
}
