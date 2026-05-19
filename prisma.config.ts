import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 6 CLI는 .env뿐 아니라 .env.local도 자동 cascade 로드해서 process.env.DATABASE_URL을 덮어쓴다.
// (config의 "skipping environment variable loading" 메시지는 .env에만 적용)
// 우회:
//   - PRISMA_ENV=test       → .env.test.local을 override:true로 강제 로드
//   - PRISMA_ENV=production → dotenv 로드 자체를 건너뛴다 (사용자가 PowerShell 등에서 직접 주입한 URL 사용)
//   - 그 외(기본)            → .env.local을 override:true로 강제 로드
if (process.env.PRISMA_ENV !== "production") {
  const envFile =
    process.env.PRISMA_ENV === "test" ? ".env.test.local" : ".env.local";
  dotenv.config({ path: envFile, override: true });
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "node prisma/seed.mjs",
  },
});
