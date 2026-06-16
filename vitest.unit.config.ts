import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// DB가 필요 없는 순수 함수/모듈 단위 테스트 전용 vitest 설정.
//
// 기본 vitest.config.ts는 tests/setup-db.ts를 거치며 prisma client를 import하고
// beforeEach에서 테스트 DB(gym_reservation_test)에 접근한다. 따라서 DB가
// 떠 있어야만 어떤 테스트도 돌릴 수 있다.
//
// 이 설정은 setup-db / setup-env를 모두 스킵해 DB 미기동 환경에서도 단위 테스트만
// 빠르게 돌릴 수 있게 한다. 기존 vitest.config.ts와 npm run test 정책은 그대로다.
//
// 새 unit 테스트를 추가할 때는 include 목록을 명시적으로 확장한다.
// 잘못된 파일이 자동 매치돼 DB 의존을 끌고 오는 일을 막기 위해서다.

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/server/admin-page-auth.test.ts",
      "src/lib/server/admin-auth.test.ts",
      "src/lib/server/api-error-response.test.ts",
      "src/lib/admin/admin-auth-headers.test.ts",
      "src/lib/admin/admin-gym-client.test.ts",
      "src/lib/admin/admin-overview-client.test.ts",
      "src/lib/admin/admin-reservation-client.test.ts",
      "src/lib/admin/admin-reservation-slot-client.test.ts",
      // DB 불필요(firebase/auth 모킹). 메시지/매핑 회귀를 로컬 test:unit에서 잡기 위해 포함.
      "src/lib/firebase-email-auth.test.ts",
      "src/lib/firebase-password-update.test.ts",
      "src/lib/password-policy.test.ts",
      // 일일 리포트: 순수 타임존/메시지 로직 + cron 가드(모킹). DB 의존 집계 테스트는
      // daily-report.test.ts에 있고 그건 full suite(npm run test) 전용이라 여기 넣지 않는다.
      "src/lib/server/daily-report-format.test.ts",
      "src/app/api/cron/daily-report/route.test.ts",
      // 예약 이벤트 알림: 메시지 빌더 + best-effort 격리(notify-slack 모킹).
      "src/lib/server/reservation-notify.test.ts",
      // AI 브리핑(레이어2): PII 스크럽 + SDK 모킹으로 프롬프트/파싱/폴백 검증.
      "src/lib/server/ai-brief.test.ts",
      // 예약/정산 원장(Phase 4): googleapis/prisma 모킹으로 행 매핑·full-replace·가드 검증.
      "src/lib/server/sheets-ledger.test.ts",
      "src/app/api/cron/ledger-sync/route.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@tests": fileURLToPath(new URL("./tests", import.meta.url)),
      // server-only 가드는 노드 환경에서 무력화. 기본 config와 동일.
      "server-only": fileURLToPath(
        new URL("./tests/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
