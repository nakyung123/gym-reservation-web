// 부하 테스트용 예약 대량 생성/삭제 (로컬 dev DB 전용).
//
//   node load-test/setup/seed-bulk.mjs seed 120000  → 예약 N건 생성 (id prefix k6seed-)
//   node load-test/setup/seed-bulk.mjs clean        → k6seed- 예약 전부 삭제
//   node load-test/setup/seed-bulk.mjs count        → 현재 행 수
//
// 슬롯 카운터는 건드리지 않는다(조회 성능 측정용 데이터라 예약 흐름과 무관).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PREFIX = "k6seed-";
const STATUSES = ["reserved", "cancelled", "used"];
const TIMES = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];

function dateAt(offsetDays) {
  const d = new Date("2025-01-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seed(total) {
  const gyms = await prisma.gym.findMany({
    select: { id: true, sports: { select: { sport: true } } },
  });
  if (gyms.length === 0) throw new Error("체육관이 없습니다. db:seed 먼저.");

  const pairs = [];
  for (const g of gyms) {
    for (const s of g.sports) pairs.push({ gymId: g.id, sport: s.sport });
  }

  // 날짜를 2년(730일)에 뿌린다. 한 달 범위 조회가 전체의 약 4%가 되어
  // 인덱스가 유리해지는 선택도를 만든다(현실적인 운영 분포에 가깝다).
  const SPREAD_DAYS = 730;
  const BATCH = 5000;
  let done = 0;

  while (done < total) {
    const n = Math.min(BATCH, total - done);
    const rows = Array.from({ length: n }, (_, k) => {
      const i = done + k;
      const p = pairs[i % pairs.length];
      const date = dateAt(i % SPREAD_DAYS);
      const time = TIMES[i % TIMES.length];
      const status = STATUSES[i % STATUSES.length];
      const userId = `${PREFIX}u${i % 5000}`;
      return {
        id: `${PREFIX}${i}`,
        userId,
        gymId: p.gymId,
        sport: p.sport,
        date,
        time,
        price: 10000 + (i % 9) * 1000,
        status,
        activeKey: `${PREFIX}${i}-key`,
        createdAt: new Date(Date.now() - (i % SPREAD_DAYS) * 86400000),
      };
    });
    await prisma.reservation.createMany({ data: rows, skipDuplicates: true });
    done += n;
    process.stdout.write(`  생성 ${done}/${total}\r`);
  }
  console.log("");
  await report();
}

async function clean() {
  // 대량 삭제는 한 번에 하면 락이 길어지므로 나눠서 지운다.
  let total = 0;
  for (;;) {
    const ids = await prisma.reservation.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
      take: 10000,
    });
    if (ids.length === 0) break;
    const r = await prisma.reservation.deleteMany({
      where: { id: { in: ids.map((x) => x.id) } },
    });
    total += r.count;
    process.stdout.write(`  삭제 ${total}\r`);
  }
  console.log("");
  console.log(`k6seed- 예약 ${total}건 삭제`);
  await report();
}

async function report() {
  const [all, seeded] = await Promise.all([
    prisma.reservation.count(),
    prisma.reservation.count({ where: { id: { startsWith: PREFIX } } }),
  ]);
  console.log(`예약 총 ${all}건 (그중 k6seed- ${seeded}건)`);
}

const mode = process.argv[2];
try {
  if (mode === "seed") await seed(Number(process.argv[3] || 120000));
  else if (mode === "clean") await clean();
  else if (mode === "count") await report();
  else {
    console.error("사용법: node seed-bulk.mjs <seed N|clean|count>");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
