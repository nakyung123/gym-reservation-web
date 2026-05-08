import dotenv from "dotenv";

// vitest setupFiles의 첫 번째로 평가되어, prisma client가 import되기 전에
// process.env.DATABASE_URL을 .env.test.local 값으로 강제 설정한다.
// Vite가 .env.local을 cascade 로드한 뒤에도 override:true로 우리 값을 우선시한다.
dotenv.config({ path: ".env.test.local", override: true });
