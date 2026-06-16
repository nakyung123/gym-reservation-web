// 일일 운영 리포트의 순수 로직(타임존 계산 + Slack 메시지 빌더)만 모은 모듈.
// prisma/외부 IO를 import하지 않아 DB 없이도 단위 테스트할 수 있다(vitest.unit.config 포함 대상).
// (AiBrief는 타입만 import하므로 런타임 의존이 없다 — 순수성 유지.)
//
// 핵심 원칙:
// - 운영 기준 시각은 KST(UTC+9). Vercel cron은 UTC로 돌므로 "어제(KST)"를 명시 변환한다.
// - "어제 생성된" 이벤트 지표는 생성 시점(createdAt) UTC 범위 [start, end)로만 집계한다.
//   현재 status로 거르지 않으므로 cron이 두 번 실행돼도 숫자가 흔들리지 않는다(멱등).
// - 금액은 "매출/정산"이 아니라 "예약가치(booked value)"다. 결제 연동 전이라 실제 수금액이 아니다.

import type { AiBrief } from "@/lib/server/ai-brief";

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// UTC instant를 KST 벽시계 기준 "YYYY-MM-DD"로 변환한다.
export function kstDateString(instant: Date): string {
  const kst = new Date(instant.getTime() + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type KstYesterdayRange = {
  // createdAt 필터에 쓰는 UTC 반열린 구간 [startUtc, endUtc). 경계 instant는 다음 날에 귀속.
  startUtc: Date;
  endUtc: Date;
  // 리포트 대상일(어제)의 KST 날짜 라벨.
  dateLabel: string;
};

// now(UTC instant) 기준으로 "어제(KST)" 하루에 해당하는 UTC 구간을 계산한다.
export function kstYesterdayUtcRange(now: Date): KstYesterdayRange {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  // KST 기준 오늘 자정(벽시계)을 UTC ms로 만든 뒤, 오프셋을 빼 실제 UTC instant로 환산.
  const kstTodayMidnightMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  const todayStartUtc = new Date(kstTodayMidnightMs - KST_OFFSET_MS);
  const startUtc = new Date(todayStartUtc.getTime() - DAY_MS);
  return {
    startUtc,
    endUtc: todayStartUtc,
    dateLabel: kstDateString(startUtc),
  };
}

// now(UTC instant) 기준 "오늘(KST)" 날짜 문자열. 슬롯 date(VarChar "YYYY-MM-DD") 비교에 쓴다.
export function kstTodayDateString(now: Date): string {
  return kstDateString(now);
}

// AI 브리핑 baseline(이상치 판단 기준)으로 쓰는 "어제 직전 N일" 일평균 집계 구간의 기본 길이.
export const BASELINE_DAYS = 7;

export type KstBaselineRange = {
  // baseline 일평균을 집계할 createdAt UTC 반열린 구간 [startUtc, endUtc).
  startUtc: Date;
  endUtc: Date;
  // 평균을 낼 때 나눌 일수(=구간 길이).
  days: number;
};

// now 기준 "어제" 직전 N일(기본 7일) 구간 [start, end). end = 어제 시작이라 어제 자신은 제외된다.
// 어제 지표를 이 일평균과 비교해 이상치를 판단한다.
export function kstBaselineUtcRange(
  now: Date,
  days: number = BASELINE_DAYS,
): KstBaselineRange {
  const { startUtc: yesterdayStartUtc } = kstYesterdayUtcRange(now);
  return {
    startUtc: new Date(yesterdayStartUtc.getTime() - days * DAY_MS),
    endUtc: yesterdayStartUtc,
    days,
  };
}

export type DailyReportData = {
  // 리포트 대상일(어제, KST). 예: "2026-06-15"
  yesterdayKstDate: string;
  // 전망용 오늘(KST) 날짜. 예: "2026-06-16"
  todayKstDate: string;
  // 어제 생성 기준(상태 무관) 지표 — 재실행 안정.
  newReservations: number;
  // 어제 생성된 예약의 price 합. "예약가치"이지 수금액이 아니다.
  bookedValueWon: number;
  newSignups: number;
  newFavorites: number;
  withdrawals: number;
  // 전망(forward-looking): 오늘 날짜의 활성(reserved) 예약 수 스냅샷.
  todayReservedCount: number;
};

function formatWon(won: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(won)}원`;
}

// DailyReportData를 Slack 메시지 텍스트로 변환한다(순수 함수).
// 활동이 0이어도 깨지지 않고 "활동 없음"을 명시한다.
// aiBrief(레이어2)는 선택: 있으면 브리핑/이상치/탈퇴 테마 섹션을 덧붙이고,
// null/undefined(생성 실패)면 말없이 숨기지 않고 "생성 실패"를 명시한다.
export function buildDailyReportText(
  data: DailyReportData,
  aiBrief?: AiBrief | null,
): string {
  const hadActivity =
    data.newReservations > 0 ||
    data.newSignups > 0 ||
    data.newFavorites > 0 ||
    data.withdrawals > 0;

  const lines: string[] = [
    `📊 일일 운영 리포트 — ${data.yesterdayKstDate} (KST)`,
    "",
    `• 신규 예약: ${data.newReservations}건 (예약가치 ${formatWon(
      data.bookedValueWon,
    )} · 수금액 아님)`,
    `• 신규 가입: ${data.newSignups}명`,
    `• 신규 즐겨찾기: ${data.newFavorites}건`,
    `• 탈퇴: ${data.withdrawals}명`,
    "",
    `📅 오늘(${data.todayKstDate}) 예약 일정: ${data.todayReservedCount}건`,
  ];

  if (!hadActivity) {
    lines.push("", "ℹ️ 어제는 신규 활동이 없었습니다.");
  }

  // 레이어2: AI 브리핑. best-effort라 생성 실패면 숫자 리포트만 나가되 그 사실을 명시한다.
  lines.push("", "──────────");
  if (aiBrief) {
    lines.push("📌 AI 브리핑", aiBrief.briefing);
    if (aiBrief.anomalies.length > 0) {
      lines.push(
        "",
        "⚠️ 이상치",
        ...aiBrief.anomalies.map((item) => `• ${item}`),
      );
    }
    if (aiBrief.withdrawalThemes.length > 0) {
      lines.push(
        "",
        "🗣 탈퇴 사유 테마",
        ...aiBrief.withdrawalThemes.map((item) => `• ${item}`),
      );
    }
  } else {
    lines.push("ℹ️ AI 브리핑은 이번 회차에 생성하지 못했습니다(숫자 리포트만 표시).");
  }

  lines.push(
    "",
    "ℹ️ 예약가치는 예약 시점 금액의 합계이며 실제 수금액/정산액이 아닙니다.",
  );

  return lines.join("\n");
}
