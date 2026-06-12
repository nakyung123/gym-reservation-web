import dotenv from "dotenv";

// vitest setupFiles의 첫 번째로 평가되어, prisma client가 import되기 전에
// process.env.DATABASE_URL을 .env.test.local 값으로 강제 설정한다.
// Vite가 .env.local을 cascade 로드한 뒤에도 override:true로 우리 값을 우선시한다.
dotenv.config({ path: ".env.test.local", override: true });

// 테스트 전용 rate-limit HMAC fallback. .env.test.local에 키가 정의되어 있지 않을
// 경우에만 적용된다. 실제 helper 동작/HMAC 정합성을 위해 16자 이상이어야 한다.
// 운영/dev 환경은 반드시 RATE_LIMIT_HMAC_SECRET를 명시적으로 설정한다 (.env.example 참고).
if (!process.env.RATE_LIMIT_HMAC_SECRET) {
  process.env.RATE_LIMIT_HMAC_SECRET = "vitest-rate-limit-default-secret";
}

// 배너 public URL 파생(bannerPublicUrl)에 쓰이는 Supabase URL 테스트 fallback.
// 실제 Storage 접근은 테스트에서 mock하므로 도메인 형식만 맞으면 된다.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
}
