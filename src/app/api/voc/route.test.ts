import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// db-voc-repository.createVocPost와 rate-limit.checkRateLimit만 모킹하고, 입력 검증(validateVocInput)과
// IP추출/429응답은 실제 구현으로 라우트의 rate limit·fail-closed·검증·dedup 통과를 검증한다.
// vi.mock은 hoist되므로 팩토리가 참조하는 mock 함수도 vi.hoisted로 함께 hoist한다.
// vitest.unit.config.ts include 대상(DB-free).
const { createVocPost, checkRateLimit, verifyIdTokenFromRequest } = vi.hoisted(
  () => ({
    createVocPost: vi.fn(),
    checkRateLimit: vi.fn(),
    verifyIdTokenFromRequest: vi.fn(),
  }),
);

vi.mock("@/lib/server/db-voc-repository", () => ({ createVocPost }));
vi.mock("@/lib/server/auth", () => ({ verifyIdTokenFromRequest }));
vi.mock("@/lib/server/rate-limit", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/server/rate-limit")>();
  return { ...actual, checkRateLimit };
});
// gymId를 보내지 않으므로 findById는 호출되지 않지만, 실제 provider의 prisma 로딩을 피하려 모킹한다.
vi.mock("@/lib/gym-repository-provider", () => ({
  gymRepository: { findById: vi.fn() },
}));

import { type NextRequest } from "next/server";
import { POST } from "@/app/api/voc/route";

const OK = { ok: true as const, remaining: 9, resetAt: new Date() };
const LIMITED = { ok: false as const, retryAfterSeconds: 30, resetAt: new Date() };

const POST_RESULT = {
  post: {
    id: "voc1",
    category: "inquiry" as const,
    gymId: null,
    authorName: "홍*동",
    title: "문의합니다",
    body: "",
    createdAt: new Date().toISOString(),
  },
  reused: false,
};

// gymId 미전송 → 서버는 null로 처리(시설 실재 확인 스킵). 유효한 4자리 비밀번호.
const VALID_BODY = {
  category: "inquiry",
  authorName: "홍길동",
  body: "문의 내용입니다.",
  password: "1234",
};

function makeRequest(body: unknown, { idToken }: { idToken?: string } = {}): NextRequest {
  return new Request("http://localhost/api/voc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/voc (공개 문의 작성)", () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue(OK);
    createVocPost.mockResolvedValue(POST_RESULT);
  });
  afterEach(() => vi.clearAllMocks());

  it("정상 작성은 per-IP rate limit을 통과하고 201 + post를 준다", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(201);
    expect(checkRateLimit).toHaveBeenCalledTimes(1); // per-IP 1단
    expect(createVocPost).toHaveBeenCalledTimes(1);
    const data = (await response.json()) as { ok?: boolean; post?: { id?: string } };
    expect(data.ok).toBe(true);
    expect(data.post?.id).toBe("voc1");
  });

  it("dedup으로 기존 글을 재사용(reused=true)해도 라우트는 동일하게 201 + post다", async () => {
    createVocPost.mockResolvedValueOnce({ ...POST_RESULT, reused: true });
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(201);
    const data = (await response.json()) as { post?: { id?: string } };
    expect(data.post?.id).toBe("voc1");
  });

  it("per-IP 한도 초과면 429이고 글을 생성하지 않는다", async () => {
    checkRateLimit.mockReset().mockResolvedValueOnce(LIMITED);
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(429);
    expect(createVocPost).not.toHaveBeenCalled();
  });

  it("rate limit 계산이 실패하면 fail-closed(5xx)이고 글을 생성하지 않는다", async () => {
    checkRateLimit.mockReset().mockRejectedValueOnce(new Error("DB down"));
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(createVocPost).not.toHaveBeenCalled();
  });

  it("비밀번호가 4자리가 아니면 400이고 글을 생성하지 않는다", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, password: "12" }));
    expect(response.status).toBe(400);
    expect(createVocPost).not.toHaveBeenCalled();
  });

  it("잘못된 JSON body는 400이다", async () => {
    const response = await POST(makeRequest("not-json"));
    expect(response.status).toBe(400);
    expect(createVocPost).not.toHaveBeenCalled();
  });

  it("Authorization 헤더 없이 작성하면 익명(userId=null)으로 저장한다", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(201);
    expect(verifyIdTokenFromRequest).not.toHaveBeenCalled();
    expect(createVocPost).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("유효한 Authorization 헤더면 uid를 글에 연결한다", async () => {
    verifyIdTokenFromRequest.mockResolvedValueOnce({ ok: true, uid: "voc-user" });
    const response = await POST(makeRequest(VALID_BODY, { idToken: "good" }));
    expect(response.status).toBe(201);
    expect(createVocPost).toHaveBeenCalledWith(expect.anything(), "voc-user");
  });

  it("Authorization 헤더가 있는데 무효면 익명 저장 대신 401로 거부한다", async () => {
    verifyIdTokenFromRequest.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "인증이 만료되었습니다.",
    });
    const response = await POST(makeRequest(VALID_BODY, { idToken: "expired" }));
    expect(response.status).toBe(401);
    expect(createVocPost).not.toHaveBeenCalled();
  });
});
