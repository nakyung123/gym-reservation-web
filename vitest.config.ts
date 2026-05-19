import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// 테스트 전용 DB URL을 미리 로드. Vite가 .env.local을 자동 cascade 로드하므로 override:true로 강제 덮어쓴다.
dotenv.config({ path: ".env.test.local", override: true });

export default defineConfig({
  test: {
    environment: "node",
    // Prisma 커넥션 공유 + 동시성 시뮬레이션을 위해 테스트 파일을 직렬 실행.
    pool: "forks",
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30_000,
    // setup-env가 먼저 평가되어 process.env.DATABASE_URL을 강제 설정한 뒤,
    // setup-db가 prisma client를 import한다. 순서 중요.
    setupFiles: ["./tests/setup-env.ts", "./tests/setup-db.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@tests": fileURLToPath(new URL("./tests", import.meta.url)),
      // Next.js의 server-only 가드를 vitest 노드 환경에서 무력화.
      "server-only": fileURLToPath(
        new URL("./tests/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
