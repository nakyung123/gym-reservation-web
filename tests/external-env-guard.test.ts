import { afterEach, describe, expect, it, vi } from "vitest";

// tests/setup-env.ts 가 외부 서비스 값을 지우는지 검사한다(2026-11-22 테스트 중 실제 Slack 메시지가 나간 사고).
// 목록은 setup-env 에서 가져오지 않고 여기 따로 둔다. setup-env 에서 키가 빠지면 이 테스트가 잡게 하기 위해서다.
// 외부 서비스를 부르는 값을 새로 쓰기 시작하면 두 곳에 함께 더한다.
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
  "NEXT_PUBLIC_FIREBASE_API_KEY",
];

describe("테스트 실행 중 외부 서비스 값", () => {
  afterEach(() => {
    for (const key of EXTERNAL_SERVICE_ENV_KEYS) delete process.env[key];
  });

  it("지금 테스트 프로세스에 남아 있지 않다(키 이름만 비교, 값은 보지 않는다)", () => {
    expect(EXTERNAL_SERVICE_ENV_KEYS.filter((key) => process.env[key] !== undefined)).toEqual([]);
  });

  it("셸에서 값을 물려받아도 setup-env 를 거치면 모두 지워진다", async () => {
    // 이 PC 의 환경 변수와 상관없이 검사되도록 가짜 값을 직접 넣고 setup-env 를 다시 실행한다.
    for (const key of EXTERNAL_SERVICE_ENV_KEYS) process.env[key] = "from-shell";
    vi.resetModules();

    await import("./setup-env");

    expect(EXTERNAL_SERVICE_ENV_KEYS.filter((key) => process.env[key] !== undefined)).toEqual([]);
  });
});
