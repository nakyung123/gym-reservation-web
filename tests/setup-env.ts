import dotenv from "dotenv";

// vitest setupFiles의 첫 번째로 평가되어, prisma client가 import되기 전에
// process.env.DATABASE_URL을 .env.test.local 값으로 강제 설정한다.
// Vite가 .env.local을 cascade 로드한 뒤에도 override:true로 우리 값을 우선시한다.
dotenv.config({ path: ".env.test.local", override: true });

// 테스트 프로세스는 실행한 셸의 환경 변수를 그대로 물려받는다. OS 에 외부 서비스 값이 등록되어 있으면
// (2026-11-22: Windows 사용자 환경 변수의 SLACK_WEBHOOK_URL) 테스트가 실제 외부 서비스로 요청을 보낸다.
// 그날 테스트 중 실제 Slack 메시지 2건이 나갔다. 값이 어디서 왔든 외부 호출에 쓰는 값은 여기서 모두 지운다.
// 값이 필요한 테스트는 vi.stubEnv 로 직접 넣는다. tests/external-env-guard.test.ts 가 이 동작을 검사한다.
const EXTERNAL_SERVICE_ENV_KEYS = [
  "SLACK_WEBHOOK_URL",
  "PAYMENT_PROVIDER",
  "TOSS_SECRET_KEY",
  "TOSS_CLIENT_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "KAKAO_REST_API_KEY",
  "KAKAO_CLIENT_SECRET",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  // 공개 값이지만 서버(firebase-password-verify)가 이 키로 Google Identity Toolkit 을 부른다.
  "NEXT_PUBLIC_FIREBASE_API_KEY",
] as const;
for (const key of EXTERNAL_SERVICE_ENV_KEYS) {
  delete process.env[key];
}

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
