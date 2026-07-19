// HTTP 응답시간에서 DB 쿼리가 차지하는 비중을 분리해 측정한다.
// EXPLAIN ANALYZE로 순수 DB 실행시간만 뽑는다(네트워크·인증·Next 오버헤드 제외).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const CASES = [
  [
    "예약 목록 (date)",
    `SELECT * FROM reservations WHERE date = '2025-06-15' ORDER BY created_at DESC LIMIT 100`,
  ],
  [
    "일자 개요 (date+status)",
    `SELECT count(*) FROM reservations WHERE date = '2025-06-15' AND status = 'used'`,
  ],
  [
    "매출 집계 (월 범위 groupBy)",
    `SELECT gym_id, status, count(*), sum(price) FROM reservations
     WHERE date >= '2025-06-01' AND date <= '2025-06-28' GROUP BY gym_id, status`,
  ],
  [
    "슬롯 개요 (date)",
    `SELECT capacity, reserved_count, is_closed FROM reservation_slots WHERE date = '2025-06-15'`,
  ],
];

const RUNS = 5;

const [{ count }] = await prisma.$queryRawUnsafe(
  `SELECT count(*)::int AS count FROM reservations`,
);
console.log(`예약 행 수: ${count}\n`);

for (const [label, sql] of CASES) {
  const times = [];
  let plan = "";
  for (let i = 0; i < RUNS; i += 1) {
    const rows = await prisma.$queryRawUnsafe(`EXPLAIN ANALYZE ${sql}`);
    const text = rows.map((r) => r["QUERY PLAN"]).join("\n");
    if (i === 0) plan = text.includes("Seq Scan") ? "Seq Scan" : "Index";
    const m = text.match(/Execution Time: ([\d.]+) ms/);
    if (m) times.push(Number(m[1]));
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  console.log(
    `${label.padEnd(28)} ${plan.padEnd(9)} 중앙값 ${med.toFixed(2)} ms  (${times.map((t) => t.toFixed(1)).join(", ")})`,
  );
}

await prisma.$disconnect();
