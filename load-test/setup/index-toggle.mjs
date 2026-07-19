// 인덱스 on/off 비교용 (로컬 dev DB 전용).
//
//   node load-test/setup/index-toggle.mjs off      → 오늘 추가한 인덱스 3종 DROP
//   node load-test/setup/index-toggle.mjs on       → 재생성 (마이그레이션 SQL과 동일)
//   node load-test/setup/index-toggle.mjs status   → 현재 존재 여부
//
// 운영 DB에는 절대 실행하지 않는다. .env.local(로컬 dev)만 대상.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const INDEXES = [
  {
    name: "idx_res_date_status",
    create: `CREATE INDEX "idx_res_date_status" ON "reservations"("date", "status")`,
  },
  {
    name: "idx_res_gym_date",
    create: `CREATE INDEX "idx_res_gym_date" ON "reservations"("gym_id", "date")`,
  },
  {
    name: "idx_res_slots_date",
    create: `CREATE INDEX "idx_res_slots_date" ON "reservation_slots"("date")`,
  },
];

async function guardLocal() {
  const [row] = await prisma.$queryRawUnsafe(
    `SELECT current_database() AS db`,
  );
  // 로컬 dev DB 이름이 아니면 즉시 중단(운영 오조작 방지).
  if (!String(row.db).includes("dev")) {
    throw new Error(
      `안전장치: 대상 DB가 "${row.db}"입니다. 로컬 dev DB에서만 실행하세요.`,
    );
  }
  return row.db;
}

async function status() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes
     WHERE indexname IN ('idx_res_date_status','idx_res_gym_date','idx_res_slots_date')`,
  );
  const have = rows.map((r) => r.indexname);
  for (const i of INDEXES) {
    console.log(`${have.includes(i.name) ? "있음" : "없음"}  ${i.name}`);
  }
}

async function off() {
  const db = await guardLocal();
  for (const i of INDEXES) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${i.name}"`);
  }
  await prisma.$executeRawUnsafe(`ANALYZE "reservations"`);
  await prisma.$executeRawUnsafe(`ANALYZE "reservation_slots"`);
  console.log(`[${db}] 인덱스 3종 DROP + ANALYZE 완료`);
  await status();
}

async function on() {
  const db = await guardLocal();
  for (const i of INDEXES) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${i.name}"`);
    await prisma.$executeRawUnsafe(i.create);
  }
  await prisma.$executeRawUnsafe(`ANALYZE "reservations"`);
  await prisma.$executeRawUnsafe(`ANALYZE "reservation_slots"`);
  console.log(`[${db}] 인덱스 3종 재생성 + ANALYZE 완료`);
  await status();
}

const mode = process.argv[2];
try {
  if (mode === "off") await off();
  else if (mode === "on") await on();
  else if (mode === "status") await status();
  else {
    console.error("사용법: node index-toggle.mjs <on|off|status>");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
