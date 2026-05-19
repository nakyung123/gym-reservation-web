// Postgres gyms 시드 스크립트
// src/data/gyms.json을 SSOT로 사용해 upsert한다.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gymsJsonPath = resolve(__dirname, "../src/data/gyms.json");
const gyms = JSON.parse(readFileSync(gymsJsonPath, "utf-8"));

const prisma = new PrismaClient();

async function upsertGym(gym) {
  const baseFields = {
    name: gym.name,
    region: gym.region,
    address: gym.address,
    officialUrl: gym.officialUrl,
    openHours: gym.openHours,
    basePrice: gym.basePrice,
    description: gym.description,
    latitude: gym.latitude,
    longitude: gym.longitude,
    sportPrices: gym.sportPrices,
    facilities: gym.facilities,
    availableTimes: gym.availableTimes,
    closedDays: gym.closedDays,
    isActive: gym.isActive ?? true,
  };

  const sportRows = gym.sports.map((sport) => ({ sport }));

  await prisma.gym.upsert({
    where: { id: gym.id },
    create: {
      id: gym.id,
      ...baseFields,
      sports: { create: sportRows },
    },
    update: {
      ...baseFields,
      sports: {
        deleteMany: {},
        create: sportRows,
      },
    },
  });
}

async function main() {
  for (const gym of gyms) {
    await upsertGym(gym);
    console.log(`upserted: ${gym.id}`);
  }
  console.log(`총 ${gyms.length}개 체육관 동기화 완료`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
