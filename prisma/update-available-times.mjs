// 일회성 데이터 업데이트: gyms.json의 availableTimes를 DB gym 레코드에 반영한다.
// 예약 시간대를 매시 연속 정시로 전환하는 작업용. sports/예약 등 다른 컬럼은 건드리지 않는다.
//
// 실행:
//   로컬:  npm run db:times
//   운영:  (승인 후) $env:DATABASE_URL/$env:DIRECT_URL 주입 뒤 npm run db:times:prod -- --confirm-prod
//
// 멱등: 같은 값을 다시 써도 결과 동일. 예약(reservation)·슬롯(reservation_slot) 레코드는
// 그대로 유지된다(과거 예약 time은 모두 :00이고 각 gym의 새 매시 목록이 기존 목록의 상위집합이라
// → orphan 없음). ※ availableTimes는 openHours 마감 직전 정시까지만 담는다.
//
// 안전장치: 대상 DB가 로컬(localhost/127.0.0.1)이 아니면 --confirm-prod 없이는 거부한다
// (.env가 실수로 운영을 가리켜도 운영 availableTimes를 덮어쓰지 않게 하는 심층 방어).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gymsJsonPath = resolve(__dirname, "../src/data/gyms.json");
const gyms = JSON.parse(readFileSync(gymsJsonPath, "utf-8"));

const prisma = new PrismaClient();

function maskedDbHost() {
  return (process.env.DATABASE_URL ?? "(미정의)").replace(
    /\/\/[^@]+@/,
    "//***:***@",
  );
}

async function main() {
  const confirmedProd = process.argv.includes("--confirm-prod");
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalDb = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log(`대상 DB: ${maskedDbHost()}`);

  // 대상이 로컬이 아니면(=운영 의심) --confirm-prod 없이는 거부한다(seed-demo와 동일 심층 방어).
  if (!isLocalDb && !confirmedProd) {
    console.error(
      "[update-times] 대상 DB가 로컬이 아닙니다. 운영 DB의 availableTimes를 덮어쓰려면 의도를 명시해\n" +
        "               `--confirm-prod` 플래그와 함께 다시 실행하세요. 안전을 위해 중단합니다.",
    );
    process.exitCode = 1;
    return;
  }

  let updated = 0;
  for (const gym of gyms) {
    if (!Array.isArray(gym.availableTimes) || gym.availableTimes.length === 0) {
      console.warn(`[skip] ${gym.id}: availableTimes가 비어 있어 건너뜀`);
      continue;
    }
    const result = await prisma.gym.updateMany({
      where: { id: gym.id },
      data: { availableTimes: gym.availableTimes },
    });
    if (result.count === 0) {
      console.warn(`[miss] ${gym.id}: 해당 id의 gym이 DB에 없음`);
      continue;
    }
    updated += result.count;
    console.log(
      `updated: ${gym.id} → ${gym.availableTimes.length}개 (${gym.availableTimes[0]}~${gym.availableTimes.at(-1)})`,
    );
  }
  console.log(`총 ${updated}개 gym의 availableTimes 갱신 완료`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
