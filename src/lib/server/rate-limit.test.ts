import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";
import { prisma } from "@/lib/server/prisma-client";

const TEST_SECRET = "test-rate-limit-secret-key-1234567890";

describe("rate-limit", () => {
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.RATE_LIMIT_HMAC_SECRET;
    process.env.RATE_LIMIT_HMAC_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.RATE_LIMIT_HMAC_SECRET;
    } else {
      process.env.RATE_LIMIT_HMAC_SECRET = originalSecret;
    }
  });

  // setup-db는 도메인 테이블만 정리하므로 rate_limit_buckets는 여기서 비운다.
  beforeEach(async () => {
    await prisma.rateLimitBucket.deleteMany({});
  });

  describe("checkRateLimit", () => {
    it("첫 호출은 ok:true이고 remaining = limit - 1", async () => {
      const r = await checkRateLimit({
        scope: "test:ip",
        identifier: "1.1.1.1",
        limit: 3,
        windowMs: 60_000,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.remaining).toBe(2);
        expect(r.resetAt).toBeInstanceOf(Date);
      }
    });

    it("limit번까지 ok:true, 그 다음 호출은 ok:false + retryAfterSeconds 양수", async () => {
      const now = new Date("2026-05-26T10:00:00.000Z");
      const input = {
        scope: "test:ip",
        identifier: "2.2.2.2",
        limit: 3,
        windowMs: 60_000,
        now,
      };

      const r1 = await checkRateLimit(input);
      const r2 = await checkRateLimit(input);
      const r3 = await checkRateLimit(input);
      const r4 = await checkRateLimit(input);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r3.ok).toBe(true);
      expect(r4.ok).toBe(false);
      if (!r4.ok) {
        expect(r4.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(r4.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    });

    it("limit 초과 후에도 카운트는 계속 증가하고 계속 ok:false", async () => {
      const now = new Date("2026-05-26T10:00:00.000Z");
      const input = {
        scope: "test:ip",
        identifier: "3.3.3.3",
        limit: 1,
        windowMs: 60_000,
        now,
      };
      await checkRateLimit(input); // 1
      const blocked1 = await checkRateLimit(input); // 2 → blocked
      const blocked2 = await checkRateLimit(input); // 3 → still blocked
      expect(blocked1.ok).toBe(false);
      expect(blocked2.ok).toBe(false);

      const row = await prisma.rateLimitBucket.findFirst({
        where: { scope: "test:ip" },
      });
      expect(row?.count).toBe(3);
    });

    it("다른 scope끼리는 독립적으로 카운트된다", async () => {
      const input = {
        identifier: "4.4.4.4",
        limit: 1,
        windowMs: 60_000,
      };
      const a = await checkRateLimit({ ...input, scope: "test:scope-a" });
      const b = await checkRateLimit({ ...input, scope: "test:scope-b" });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    });

    it("다른 identifier끼리는 독립적으로 카운트된다", async () => {
      const input = {
        scope: "test:ip",
        limit: 1,
        windowMs: 60_000,
      };
      const a = await checkRateLimit({ ...input, identifier: "10.0.0.1" });
      const b = await checkRateLimit({ ...input, identifier: "10.0.0.2" });
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    });

    it("windowMs를 넘어가면 새 window로 reset된다 (now 주입)", async () => {
      const t0 = new Date("2026-05-26T10:00:00.000Z");
      const tNext = new Date(t0.getTime() + 61_000);
      const input = {
        scope: "test:ip",
        identifier: "5.5.5.5",
        limit: 1,
        windowMs: 60_000,
      };

      const r1 = await checkRateLimit({ ...input, now: t0 });
      const r2 = await checkRateLimit({ ...input, now: t0 });
      const r3 = await checkRateLimit({ ...input, now: tNext });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(false);
      expect(r3.ok).toBe(true); // 새 윈도우
    });

    it("동시 호출에서도 카운트가 정확히 누적된다 (race)", async () => {
      const input = {
        scope: "test:race",
        identifier: "6.6.6.6",
        limit: 100,
        windowMs: 60_000,
      };
      const N = 10;
      await Promise.all(
        Array.from({ length: N }, () => checkRateLimit(input)),
      );
      const row = await prisma.rateLimitBucket.findFirst({
        where: { scope: "test:race" },
      });
      expect(row?.count).toBe(N);
    });

    it("identifier가 같아도 scope가 다르면 hash가 다르다 (cross-scope 충돌 방지)", async () => {
      await checkRateLimit({
        scope: "test:a",
        identifier: "7.7.7.7",
        limit: 5,
        windowMs: 60_000,
      });
      await checkRateLimit({
        scope: "test:b",
        identifier: "7.7.7.7",
        limit: 5,
        windowMs: 60_000,
      });
      const rows = await prisma.rateLimitBucket.findMany({
        where: { scope: { in: ["test:a", "test:b"] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].identifierHash).not.toBe(rows[1].identifierHash);
    });

    it("identifierHash는 64자 hex (HMAC-SHA256)", async () => {
      await checkRateLimit({
        scope: "test:hash",
        identifier: "8.8.8.8",
        limit: 5,
        windowMs: 60_000,
      });
      const row = await prisma.rateLimitBucket.findFirst({
        where: { scope: "test:hash" },
      });
      expect(row?.identifierHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("원문 identifier(IP)는 어떤 컬럼에도 저장되지 않는다", async () => {
      const rawIp = "9.9.9.9";
      await checkRateLimit({
        scope: "test:no-raw",
        identifier: rawIp,
        limit: 5,
        windowMs: 60_000,
      });
      const rows = await prisma.rateLimitBucket.findMany({
        where: { scope: "test:no-raw" },
      });
      const serialized = JSON.stringify(rows);
      expect(serialized.includes(rawIp)).toBe(false);
    });
  });

  describe("입력 검증", () => {
    const base = {
      scope: "test:val",
      identifier: "ip",
      limit: 5,
      windowMs: 60_000,
    };

    it("scope가 비어 있으면 throw", async () => {
      await expect(
        checkRateLimit({ ...base, scope: "" }),
      ).rejects.toThrow(/scope/);
    });
    it("identifier가 비어 있으면 throw", async () => {
      await expect(
        checkRateLimit({ ...base, identifier: "" }),
      ).rejects.toThrow(/identifier/);
    });
    it("limit <= 0이면 throw", async () => {
      await expect(checkRateLimit({ ...base, limit: 0 })).rejects.toThrow(
        /limit/,
      );
    });
    it("windowMs <= 0이면 throw", async () => {
      await expect(
        checkRateLimit({ ...base, windowMs: 0 }),
      ).rejects.toThrow(/windowMs/);
    });
  });

  describe("HMAC secret env 검증", () => {
    afterEach(() => {
      process.env.RATE_LIMIT_HMAC_SECRET = TEST_SECRET;
    });

    it("RATE_LIMIT_HMAC_SECRET 부재 시 throw (silent fallback 금지)", async () => {
      delete process.env.RATE_LIMIT_HMAC_SECRET;
      await expect(
        checkRateLimit({
          scope: "test",
          identifier: "ip",
          limit: 5,
          windowMs: 60_000,
        }),
      ).rejects.toThrow(/RATE_LIMIT_HMAC_SECRET/);
    });

    it("RATE_LIMIT_HMAC_SECRET가 너무 짧으면 throw", async () => {
      process.env.RATE_LIMIT_HMAC_SECRET = "short";
      await expect(
        checkRateLimit({
          scope: "test",
          identifier: "ip",
          limit: 5,
          windowMs: 60_000,
        }),
      ).rejects.toThrow(/16자/);
    });
  });

  describe("extractClientIp", () => {
    it("x-forwarded-for 첫 IP를 우선한다", () => {
      const h = new Headers({
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        "x-real-ip": "3.3.3.3",
      });
      expect(extractClientIp(h)).toBe("1.1.1.1");
    });
    it("x-forwarded-for가 없으면 x-real-ip", () => {
      const h = new Headers({ "x-real-ip": "4.4.4.4" });
      expect(extractClientIp(h)).toBe("4.4.4.4");
    });
    it("둘 다 없으면 'unknown-ip' sentinel", () => {
      const h = new Headers();
      expect(extractClientIp(h)).toBe("unknown-ip");
    });
  });

  describe("rateLimitedJsonResponse", () => {
    it("status 429 + Retry-After 헤더 + 본문 형식", async () => {
      const r = rateLimitedJsonResponse({
        ok: false,
        retryAfterSeconds: 30,
        resetAt: new Date(),
      });
      expect(r.status).toBe(429);
      expect(r.headers.get("Retry-After")).toBe("30");
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      const body = await r.json();
      expect(body).toEqual({
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        retryAfterSeconds: 30,
      });
    });

    it("응답 본문에 scope/identifier/hash가 노출되지 않는다", async () => {
      const r = rateLimitedJsonResponse({
        ok: false,
        retryAfterSeconds: 5,
        resetAt: new Date(),
      });
      const text = await r.clone().text();
      expect(text).not.toMatch(/scope|identifier|hash/i);
    });
  });
});
