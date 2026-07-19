// 테스트 1: 예약 생성 동시성 — 정원 10팀 슬롯에 200명이 동시에 몰릴 때
// 초과 예약이 발생하지 않는지 검증한다.
//
// 측정 대상은 지연시간이 아니라 "정합성"이다.
// 기대: created == 10, full == 190, 그 외 0.

import http from "k6/http";
import { Counter } from "k6/metrics";
import { SharedArray } from "k6/data";

const tokens = new SharedArray("tokens", () =>
  JSON.parse(open("./tokens.json")).userTokens,
);
const target = JSON.parse(open("./target.json"));

const created = new Counter("res_created");
const full = new Counter("res_full");
const duplicate = new Counter("res_duplicate");
const rejected = new Counter("res_rejected");
const other = new Counter("res_other");

export const options = {
  scenarios: {
    // 200 VU가 각 1회씩. 램프 없이 한꺼번에 출발시켜 thundering herd를 만든다.
    herd: {
      executor: "per-vu-iterations",
      vus: 200,
      iterations: 1,
      maxDuration: "120s",
    },
  },
  // 정합성 테스트라 실패 임계는 응답 자체에 둔다(5xx가 하나라도 있으면 실패).
  thresholds: {
    "http_req_failed{expected_response:true}": ["rate<0.01"],
    res_created: ["count==10"],
    res_other: ["count==0"],
  },
};

export default function bookingRace() {
  const token = tokens[__VU - 1];
  const res = http.post(
    `${__ENV.BASE}/api/reservations`,
    JSON.stringify(target),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      tags: { name: "POST /api/reservations" },
    },
  );

  let status = "";
  try {
    status = JSON.parse(res.body).status || "";
  } catch {
    status = "";
  }

  if (res.status === 201 && status === "created") created.add(1);
  else if (res.status === 409 && status === "full") full.add(1);
  else if (res.status === 409 && status === "duplicate") duplicate.add(1);
  else if (res.status === 422 && status === "rejected") rejected.add(1);
  else {
    other.add(1);
    console.error(`예상 밖 응답 ${res.status}: ${String(res.body).slice(0, 200)}`);
  }
}
