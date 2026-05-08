import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 6 CLI는 .env뿐 아니라 .env.local도 자동 cascade 로드해서 process.env.DATABASE_URL을 덮어쓴다.
// (config의 "skipping environment variable loading" 메시지는 .env에만 적용)
// 우회: PRISMA_ENV=test 마커가 있으면 .env.test.local을, 그 외엔 .env.local을 override:true로 강제 로드한다.
const envFile =
  process.env.PRISMA_ENV === "test" ? ".env.test.local" : ".env.local";
dotenv.config({ path: envFile, override: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "node prisma/seed.mjs",
  },
});
