import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// verifyVocPost와 rate-limit.checkRateLimit만 모킹하고, IP추출/429응답은 실제 구현으로
// per-IP·per-post 이중 rate limit·fail-closed·정상 200/401/404 경로를 검증한다(DB-free).
// vitest.unit.config.ts include 대상.
const { verifyVocPost, checkRateLimit } = vi.hoisted(() => ({
  verifyVocPost: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/db-voc-repository", () => ({ verifyVocPost }));
vi.mock("@/lib/server/rate-limit", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/server/rate-limit")>();
  return { ...actual, checkRateLimit };
});

import { type NextRequest } from "next/server";
import { POST } from "@/app/api/voc/[id]/verify/route";

const OK = { ok: true as const, remaining: 9, resetAt: new Date() };
const LIMITED = { ok: false as const, retryAfterSeconds: 30, resetAt: new Date() };

const PUBLIC_POST = {
  id: "voc1",
  category: "inquiry" as const,
  gymId: null,
  authorName: "홍*동",
  title: "문의합니다",
  body: "본문 내용입니다.",
  createdAt: new Date().toISOString(),
};

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/voc/voc1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "voc1" }) };

describe("POST /api/voc/[id]/verify (비밀번호 검증 후 본문)", () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue(OK);
    verifyVocPost.mockResolvedValue({ ok: true, post: PUBLIC_POST });
  });
  afterEach(() => vi.clearAllMocks());

  it("정상 검증은 per-IP·per-post 2단을 통과하고 200 + 본문을 준다", async () => {
    const response = await POST(makeRequest({ password: "1234" }), ctx);
    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2); // per-IP + per-post
    const data = (await response.json()) as { ok?: boolean; post?: { body?: string } };
    expect(data.ok).toBe(true);
    expect(data.post?.body).toBe("본문 내용입니다.");
  });

  it("비밀번호가 틀리면 401이다", async () => {
    verifyVocPost.mockResolvedValueOnce({ ok: false, reason: "invalid-password" });
    const response = await POST(makeRequest({ password: "0000" }), ctx);
    expect(response.status).toBe(401);
  });

  it("없는 글이면 404다", async () => {
    verifyVocPost.mockResolvedValueOnce({ ok: false, reason: "not-found" });
    const response = await POST(makeRequest({ password: "1234" }), ctx);
    expect(response.status).toBe(404);
  });

  it("per-IP 한도 초과면 429이고 비밀번호를 검증하지 않는다", async () => {
    checkRateLimit.mockReset().mockResolvedValueOnce(LIMITED);
    const response = await POST(makeRequest({ password: "1234" }), ctx);
    expect(response.status).toBe(429);
    expect(verifyVocPost).not.toHaveBeenCalled();
  });

  it("per-post 한도 초과(IP는 통과)면 429이고 비밀번호를 검증하지 않는다", async () => {
    checkRateLimit
      .mockReset()
      .mockResolvedValueOnce(OK) // per-IP 통과
      .mockResolvedValueOnce(LIMITED); // per-post 초과
    const response = await POST(makeRequest({ password: "1234" }), ctx);
    expect(response.status).toBe(429);
    expect(verifyVocPost).not.toHaveBeenCalled();
  });

  it("rate limit 계산이 실패하면 fail-closed(5xx)이고 검증하지 않는다", async () => {
    checkRateLimit.mockReset().mockRejectedValueOnce(new Error("DB down"));
    const response = await POST(makeRequest({ password: "1234" }), ctx);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(verifyVocPost).not.toHaveBeenCalled();
  });

  it("비밀번호가 없으면 400이고 검증하지 않는다", async () => {
    const response = await POST(makeRequest({}), ctx);
    expect(response.status).toBe(400);
    expect(verifyVocPost).not.toHaveBeenCalled();
  });
});
