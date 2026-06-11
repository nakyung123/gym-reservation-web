import { REVENUE_BASIS_LABEL, type RevenueSummary } from "@/lib/admin/revenue";

// 매출/정산 요약을 CSV 문자열로 직렬화한다(순수 함수 — 브라우저 다운로드 로직은 view가 담당).
//
// 두 가지 방어를 포함한다:
//  1) 수식 인젝션: =,+,-,@,탭,CR,LF로 시작하는 셀은 앞에 작은따옴표를 붙여 무력화한다.
//     (시설명이 유일한 문자열 입력이라 위험 표면은 좁지만, 스프레드시트 열람을 대비해 일괄 적용한다.)
//  2) 엑셀 한글 깨짐: UTF-8 BOM을 맨 앞에 붙인다.
//
// 상태 헤더 텍스트는 화면(reservationStatusLabel)과 동일하게 맞춘다. CSV util은 node 테스트
// 환경에서 순수하게 검증하려고 client 컴포넌트를 import하지 않고 동일 텍스트를 명시한다.

const BOM = "﻿";

const COUNT_HEADERS = {
  reserved: "예약 완료",
  used: "이용 완료",
  cancelled: "예약 취소",
} as const;

function escapeCell(value: string | number): string {
  let text = String(value);
  // 수식 인젝션 무력화: 위험 문자로 시작하면 작은따옴표 prefix.
  if (/^[=+\-@\t\r\n]/.test(text)) {
    text = `'${text}`;
  }
  // 표준 CSV escape: 쉼표/따옴표/개행이 있으면 큰따옴표로 감싸고 내부 따옴표는 두 번으로.
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toRow(cells: Array<string | number>): string {
  return cells.map(escapeCell).join(",");
}

export function toRevenueCsv(summary: RevenueSummary): string {
  const header = [
    "시설",
    COUNT_HEADERS.reserved,
    COUNT_HEADERS.used,
    COUNT_HEADERS.cancelled,
    REVENUE_BASIS_LABEL.expected,
    REVENUE_BASIS_LABEL.used,
  ];

  const lines = [
    toRow(header),
    ...summary.gyms.map((gym) =>
      toRow([
        gym.gymName,
        gym.counts.reserved,
        gym.counts.used,
        gym.counts.cancelled,
        gym.revenue.expected,
        gym.revenue.used,
      ]),
    ),
    toRow([
      "합계",
      summary.counts.reserved,
      summary.counts.used,
      summary.counts.cancelled,
      summary.revenue.expected,
      summary.revenue.used,
    ]),
  ];

  // CRLF 줄바꿈 + 끝 개행. 엑셀 호환을 위해 BOM을 맨 앞에 둔다.
  return BOM + lines.join("\r\n") + "\r\n";
}

export function revenueCsvFilename(summary: RevenueSummary): string {
  return `revenue_${summary.from}_${summary.to}.csv`;
}
