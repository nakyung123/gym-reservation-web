// 테스트 2: 관리자 조회 성능 — 인덱스 유무에 따른 응답시간 비교.
//
// 대상은 오늘 인덱스를 추가한 3개 쿼리 경로다.
//   - 예약 목록  : date 필터        → idx_res_date_status
//   - 일자 개요  : date + status    → idx_res_date_status / idx_res_slots_date
//   - 매출 집계  : date 범위 groupBy → idx_res_date_status
//
// 스파이크가 아니라 정상 부하에서의 지연을 재는 것이 목적이라 일정 VU로 유지한다.

import http from "k6/http";
import { Trend } from "k6/metrics";

const adminToken = JSON.parse(open("./tokens.json")).adminToken;

const tList = new Trend("t_reservations", true);
const tOverview = new Trend("t_overview", true);
const tRevenue = new Trend("t_revenue", true);

export const options = {
  scenarios: {
    read: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
    },
  },
};

// 관리자 API는 IP당 60회/분 rate limit이 있다. 단일 IP로 부하를 주면 DB가 아니라
// rate limiter를 재게 되므로, 반복마다 다른 X-Forwarded-For를 보내 개별 클라이언트를
// 시뮬레이션한다(실제 부하도 여러 IP에서 온다).
//
// 주의: 이게 통한다는 것 자체가 extractClientIp의 XFF 무검증 신뢰를 보여준다.
// 결과 보고에서 별도로 다룬다.
function headersFor(iter) {
  return {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.${__VU % 256}.${Math.floor(iter / 256) % 256}.${iter % 256}`,
    },
  };
}

// 시드가 2025-01-01부터 730일에 걸쳐 있으므로 그 범위 안에서 고른다.
const DATES = [
  "2025-03-11",
  "2025-06-15",
  "2025-09-02",
  "2026-01-20",
  "2026-05-07",
];

export default function adminRead() {
  const d = DATES[Math.floor(Math.random() * DATES.length)];
  const base = __ENV.BASE;
  const H = headersFor(__ITER);

  const r1 = http.get(`${base}/api/admin/reservations?date=${d}`, H);
  tList.add(r1.timings.duration);

  const r2 = http.get(`${base}/api/admin/overview?date=${d}`, H);
  tOverview.add(r2.timings.duration);

  const month = d.slice(0, 7);
  const r3 = http.get(
    `${base}/api/admin/revenue?from=${month}-01&to=${month}-28`,
    H,
  );
  tRevenue.add(r3.timings.duration);

  if (r1.status !== 200 || r2.status !== 200 || r3.status !== 200) {
    console.error(
      `비정상 응답: list=${r1.status} overview=${r2.status} revenue=${r3.status} / ${String(r1.body).slice(0, 150)}`,
    );
  }
}
