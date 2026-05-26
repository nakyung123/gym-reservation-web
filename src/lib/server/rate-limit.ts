import "server-only";
import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";

// 범용 rate limit helper.
//
// 흐름:
// 1. identifier(IP/email/uid/ticketId 등 원문)를 HMAC-SHA256으로 해시
// 2. fixed window: windowStart = floor(now / windowMs) * windowMs
// 3. RateLimitBucket을 (scope, identifierHash, windowStart) PK로 upsert + count increment
// 4. count > limit이면 ok:false (retryAfterSeconds = resetAt - now)
//
// 정책:
// - in-memory Map 사용 안 함. 모든 카운팅은 DB에 원자적으로 기록.
// - 원문 IP/email/token은 절대 저장/로그 출력 안 함. HMAC 해시만.
// - RATE_LIMIT_HMAC_SECRET env 부재 시 명시 throw (no silent fallback).
// - 호출 측은 result.ok가 false일 때 HTTP 429 + Retry-After 헤더로 응답하고,
//   응답 body에 scope/identifier/hash 원문을 노출하지 말 것.
// - limit 초과 후에도 count는 계속 증가시킨다(같은 윈도우 내 추가 요청 = 추가 부담).

const MIN_HMAC_SECRET_LENGTH = 16;

export type RateLimitInput = {
  // 호출하는 흐름 식별자. 예: "oauth-start:ip", "oauth-token:ticket".
  scope: string;
  // 원문 식별자. HMAC 해시되어 저장된다.
  identifier: string;
  // 윈도우 내 최대 허용 요청 수.
  limit: number;
  // 윈도우 길이(ms).
  windowMs: number;
  // 테스트 주입용. 미지정 시 new Date().
  now?: Date;
};

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfterSeconds: number; resetAt: Date };

export async function checkRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const { scope, identifier, limit, windowMs } = input;

  if (!scope) {
    throw new Error("[rate-limit] scope가 비어 있습니다.");
  }
  if (!identifier) {
    throw new Error("[rate-limit] identifier가 비어 있습니다.");
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("[rate-limit] limit는 양의 정수여야 합니다.");
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("[rate-limit] windowMs는 양의 정수여야 합니다.");
  }

  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);
  // bucket은 window가 끝난 뒤에도 cleanup이 늦을 수 있어 expiresAt을 window 끝 + 여유로.
  const expiresAt = new Date(windowStartMs + windowMs * 2);

  const identifierHash = hashIdentifier(scope, identifier);

  // race-safe atomic increment. 첫 요청은 count=1, 이후는 increment.
  // (scope, identifierHash, windowStart) 복합 PK 충돌 시 update 분기.
  const row = await prisma.rateLimitBucket.upsert({
    where: {
      scope_identifierHash_windowStart: {
        scope,
        identifierHash,
        windowStart,
      },
    },
    create: {
      scope,
      identifierHash,
      windowStart,
      count: 1,
      expiresAt,
    },
    update: {
      count: { increment: 1 },
    },
  });

  // opportunistic cleanup. 너무 자주 돌리지 않도록 5% 확률.
  // 실패해도 본 흐름에는 영향 없게 try/catch.
  if (Math.random() < 0.05) {
    void cleanupExpiredBuckets(now).catch(() => {
      // cleanup 실패는 무시. 다음 호출에서 재시도된다.
    });
  }

  if (row.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAt.getTime() - nowMs) / 1000),
    );
    return { ok: false, retryAfterSeconds, resetAt };
  }

  return { ok: true, remaining: limit - row.count, resetAt };
}

// 만료된 bucket을 일괄 정리. opportunistic 호출만 가정.
// 매우 큰 삭제로 인한 lock 지연을 막기 위해 raw SQL로 LIMIT 적용.
async function cleanupExpiredBuckets(now: Date): Promise<void> {
  // Prisma deleteMany는 LIMIT 옵션이 없어 raw SQL로 LIMIT 1000.
  // expires_at < now 이고 LIMIT 1000.
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "rate_limit_buckets" WHERE ctid IN (
      SELECT ctid FROM "rate_limit_buckets" WHERE "expires_at" < ${now} LIMIT 1000
    )`,
  );
}

function getHmacSecret(): string {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "[rate-limit] RATE_LIMIT_HMAC_SECRET 환경변수가 설정되어 있지 않습니다.",
    );
  }
  if (secret.length < MIN_HMAC_SECRET_LENGTH) {
    throw new Error(
      `[rate-limit] RATE_LIMIT_HMAC_SECRET는 ${MIN_HMAC_SECRET_LENGTH}자 이상이어야 합니다.`,
    );
  }
  return secret;
}

// scope를 HMAC input에 포함시켜 같은 IP가 서로 다른 scope에서 충돌하지 않게 한다.
// 결과는 64자 hex. RateLimitBucket.identifierHash VARCHAR(64)와 정확히 일치.
function hashIdentifier(scope: string, identifier: string): string {
  return createHmac("sha256", getHmacSecret())
    .update(`${scope}\x1f${identifier}`)
    .digest("hex");
}

// Route Handler에서 사용할 IP 추출 helper.
// Vercel/Cloudflare reverse proxy 환경에서 x-forwarded-for의 첫 IP가 클라이언트 IP다.
// 이 신뢰는 reverse proxy(Vercel 등) 신뢰에 기반한다. 직접 Origin이 노출되어 있으면
// 위조 가능하다는 점을 운영자가 인지해야 한다.
// 추출 실패 시 "unknown-ip" sentinel을 반환한다(silent fallback 아님: 명시 sentinel).
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown-ip";
}

// 429 응답 생성 helper. 응답 본문에 scope/identifier/hash를 노출하지 않는다.
export function rateLimitedJsonResponse(
  result: Extract<RateLimitResult, { ok: false }>,
): Response {
  return Response.json(
    {
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}
