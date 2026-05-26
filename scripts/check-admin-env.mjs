#!/usr/bin/env node
// 운영 빌드 사전 점검: 보안상 필수 환경변수가 비어 있거나 정책에 맞지 않으면
// 빌드 자체를 차단한다. (런타임 fail-closed보다 한 단계 앞단 가드)
//
// 검사 대상:
// 1. ADMIN_PAGE_USER / ADMIN_PAGE_PASSWORD
//    - 관리자 페이지(/admin) Basic Auth용. 누락 시 admin 페이지가 503으로 잠긴다.
//    - ADMIN_API_TOKEN과 별개 자격. 같은 값으로 두지 말 것.
// 2. RATE_LIMIT_HMAC_SECRET (16자 이상)
//    - OAuth/admin API rate-limit helper(src/lib/server/rate-limit.ts)의 HMAC 키.
//    - 누락 / 16자 미만이면 helper가 throw → 운영에서 OAuth·admin API가 500으로 묶임.
//    - 길이 정책은 helper와 동일(MIN_HMAC_SECRET_LENGTH = 16).
//
// 정책:
// - 기본은 항상 검사한다. ambient NODE_ENV에 의존하지 않는다.
//   (npm/Next/Vercel/CI마다 NODE_ENV 주입 시점이 달라 침묵 통과 위험이 있음.)
// - 명시 opt-out: SKIP_ADMIN_ENV_CHECK=1 환경변수로만 검사를 건너뛴다.
//   (예: 로컬에서 운영 자격 없이 빌드 산출물만 확인하고 싶을 때 한정.)
// - 비밀값은 절대 stdout/stderr/log에 출력하지 않는다. 변수명과 길이 정책만 표시한다.

const MIN_HMAC_SECRET_LENGTH = 16;

if (process.env.SKIP_ADMIN_ENV_CHECK === "1") {
  process.exit(0);
}

const failures = [];

// --- ADMIN_PAGE_USER / ADMIN_PAGE_PASSWORD --------------------------------
const adminUser = process.env.ADMIN_PAGE_USER?.trim();
const adminPassword = process.env.ADMIN_PAGE_PASSWORD?.trim();
if (!adminUser) failures.push({ name: "ADMIN_PAGE_USER", reason: "missing" });
if (!adminPassword)
  failures.push({ name: "ADMIN_PAGE_PASSWORD", reason: "missing" });

// --- RATE_LIMIT_HMAC_SECRET ----------------------------------------------
const rateLimitSecret = process.env.RATE_LIMIT_HMAC_SECRET?.trim();
if (!rateLimitSecret) {
  failures.push({ name: "RATE_LIMIT_HMAC_SECRET", reason: "missing" });
} else if (rateLimitSecret.length < MIN_HMAC_SECRET_LENGTH) {
  failures.push({
    name: "RATE_LIMIT_HMAC_SECRET",
    reason: `too-short(need-at-least-${MIN_HMAC_SECRET_LENGTH}-chars)`,
  });
}

if (failures.length > 0) {
  const summary = failures
    .map(({ name, reason }) => `${name}(${reason})`)
    .join(", ");
  process.stderr.write(`[check-admin-env] 빌드 차단: ${summary}\n`);
  process.stderr.write(
    "ADMIN_PAGE_USER/PASSWORD는 /admin Basic Auth용, RATE_LIMIT_HMAC_SECRET는 OAuth/admin API rate-limit용입니다.\n",
  );
  process.stderr.write(
    "운영 환경변수에 등록한 뒤 다시 빌드하세요. 비밀값은 코드/로그/채팅에 절대 노출하지 않습니다.\n",
  );
  process.stderr.write(
    "로컬에서 검사 자체를 건너뛰려면 SKIP_ADMIN_ENV_CHECK=1 환경변수로 우회할 수 있습니다.\n",
  );
  process.exit(1);
}

process.exit(0);
