// 매출/정산 화면 데모용 예약 더미 데이터 생성 스크립트.
//
// 목적: 실사용자 없이도 월별/시설별 매출이 보이도록 과거~근미래 예약을 생성한다.
// - 모든 행 id는 "demo-rev-" prefix → 정확히 이 데이터만 골라 정리(clean)할 수 있다.
// - reservation 본체만 직접 insert한다(검증/슬롯/락 흐름은 의도적으로 우회).
//   매출 집계는 reservation.price/status/date만 사용하므로 슬롯·락은 불필요하다.
// - 과거 날짜는 used/cancelled, 현재·미래 날짜는 reserved/cancelled로 분포해
//   expected(전망)와 used(정산) 차이가 자연스럽게 생기게 한다.
// - 가격은 reservation.price SSOT 규칙과 동일하게 sportPrices[sport] ?? basePrice.
//
// 실행(개발 DB):   npm run db:seed:demo
// 정리(개발 DB):   npm run db:seed:demo -- --clean
// 운영 DB(시연용): 셸에 운영 DATABASE_URL 주입 후 반드시 --confirm-prod와 함께 실행한다(runbook 참조).
//   생성: npm run db:seed:demo:prod -- --confirm-prod
//   정리: npm run db:seed:demo:prod -- --clean --confirm-prod
//   대상이 로컬(localhost)이 아니면 --confirm-prod 없이는 거부한다(운영 오염 방지 가드).
//
// 재실행 안전성: seed 모드는 먼저 기존 데모 행을 지우고 새로 만든다(누적되지 않음).

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

// SSOT는 src/lib/domain-constants.ts의 DEMO_RESERVATION_ID_PREFIX.
// .mjs라 TS를 import할 수 없어 같은 리터럴을 자체 보유한다 — 값 변경 시 양쪽을 함께 고칠 것.
const DEMO_PREFIX = "demo-rev-";
const DEMO_USER_COUNT = 12;
const START_OFFSET_DAYS = -75; // 과거 75일부터
const END_OFFSET_DAYS = 15; // 근미래 15일까지
const MAX_PER_GYM_PER_DAY = 3;

function pad(value) {
  return String(value).padStart(2, "0");
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function chance(probability) {
  return Math.random() < probability;
}

function maskedDbHost() {
  return (process.env.DATABASE_URL ?? "(미정의)").replace(
    /\/\/[^@]+@/,
    "//***:***@",
  );
}

function gymSportPrice(gym, sport) {
  const map =
    gym.sportPrices && typeof gym.sportPrices === "object"
      ? gym.sportPrices
      : {};
  const price = map[sport];
  return typeof price === "number" ? price : gym.basePrice;
}

async function cleanDemoReservations() {
  const result = await prisma.reservation.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  return result.count;
}

async function seed() {
  const gyms = await prisma.gym.findMany({
    where: { isActive: true },
    include: { sports: true },
  });

  if (gyms.length === 0) {
    console.error(
      "활성 시설이 없습니다. 먼저 `npm run db:seed`로 시설을 동기화하세요.",
    );
    process.exit(1);
  }

  // 재실행 시 누적을 막기 위해 기존 데모 행을 먼저 정리한다.
  const removed = await cleanDemoReservations();
  if (removed > 0) {
    console.log(`기존 데모 예약 ${removed}건 정리`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userIds = Array.from(
    { length: DEMO_USER_COUNT },
    (_, index) => `demo-user-${index + 1}`,
  );

  const rows = [];

  for (let offset = START_OFFSET_DAYS; offset <= END_OFFSET_DAYS; offset++) {
    const serviceDate = new Date(today);
    serviceDate.setDate(today.getDate() + offset);
    const dateStr = toYmd(serviceDate);
    const isPast = offset < 0;

    for (const gym of gyms) {
      const sports = gym.sports.map((row) => row.sport);
      const times = Array.isArray(gym.availableTimes) ? gym.availableTimes : [];
      if (sports.length === 0 || times.length === 0) {
        continue;
      }

      const count = Math.floor(Math.random() * (MAX_PER_GYM_PER_DAY + 1));
      const usedTimes = new Set();

      for (let k = 0; k < count; k++) {
        const time = pick(times);
        if (usedTimes.has(time)) {
          continue; // 같은 시설·날짜·시간 중복 회피
        }
        usedTimes.add(time);

        const sport = pick(sports);
        const price = gymSportPrice(gym, sport);

        // 과거: 이용완료 위주 / 현재·미래: 예약 위주. 나머지는 취소.
        const status = isPast
          ? chance(0.75)
            ? "used"
            : "cancelled"
          : chance(0.75)
            ? "reserved"
            : "cancelled";

        const id = `${DEMO_PREFIX}${randomUUID()}`;
        // 예약 생성 시점은 서비스일 1~5일 전으로 둔다.
        const createdAt = new Date(serviceDate);
        createdAt.setDate(
          serviceDate.getDate() - (1 + Math.floor(Math.random() * 5)),
        );

        rows.push({
          id,
          userId: pick(userIds),
          gymId: gym.id,
          sport,
          date: dateStr,
          time,
          price,
          status,
          createdAt,
          activeKey: `demo-${id}`,
        });
      }
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.reservation.createMany({ data: rows.slice(i, i + CHUNK) });
  }

  console.log(
    `생성된 데모 예약 ${rows.length}건 ` +
      `(시설 ${gyms.length}곳, ${START_OFFSET_DAYS}~${END_OFFSET_DAYS}일, 데모 유저 ${DEMO_USER_COUNT}명)`,
  );
}

async function main() {
  const isClean = process.argv.includes("--clean");
  const confirmedProd = process.argv.includes("--confirm-prod");
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalDb = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log(`대상 DB: ${maskedDbHost()}`);
  console.log(`모드: ${isClean ? "clean(정리)" : "seed(생성)"}`);

  // 안전장치: 대상이 로컬(localhost/127.0.0.1)이 아니면(=운영 의심) --confirm-prod 없이는 거부한다.
  // .env가 실수로 운영을 가리켜도 데모 데이터가 운영에 섞이거나 지워지지 않게 막는 심층 방어.
  if (!isLocalDb && !confirmedProd) {
    console.error(
      "[seed-demo] 대상 DB가 로컬이 아닙니다. 운영 DB에 데모 데이터를 넣거나 지우려면 의도를 명시해\n" +
        "           `--confirm-prod` 플래그와 함께 다시 실행하세요. 안전을 위해 중단합니다.",
    );
    process.exitCode = 1;
    return;
  }

  if (isClean) {
    const removed = await cleanDemoReservations();
    console.log(`삭제된 데모 예약 ${removed}건`);
    return;
  }

  await seed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
