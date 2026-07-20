import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// faq-bot.streamFaqAnswer와 rate-limit.checkRateLimit만 모킹하고 나머지(sanitize/IP추출/429응답)는
// 실제 구현을 써서 라우트의 검증·3단 rate limit·fail-closed·스트림 브릿지를 검증한다.
// vi.mock은 hoist되므로 팩토리가 참조하는 mock 함수도 vi.hoisted로 함께 hoist한다.
// vitest.unit.config.ts include 대상.
const { streamFaqAnswer, checkRateLimit, verifyIdTokenFromRequest } = vi.hoisted(
  () => ({
    streamFaqAnswer: vi.fn(),
    checkRateLimit: vi.fn(),
    verifyIdTokenFromRequest: vi.fn(),
  }),
);

vi.mock("@/lib/server/auth", () => ({ verifyIdTokenFromRequest }));

vi.mock("@/lib/server/faq-bot", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/server/faq-bot")>();
  return { ...actual, streamFaqAnswer };
});
vi.mock("@/lib/server/rate-limit", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/server/rate-limit")>();
  return { ...actual, checkRateLimit };
});

import { type NextRequest } from "next/server";
import { POST } from "@/app/api/faq-chat/route";

const OK = { ok: true as const, remaining: 9, resetAt: new Date() };
const LIMITED = {
  ok: false as const,
  retryAfterSeconds: 30,
  resetAt: new Date(),
};

function makeRequest(body: unknown, idToken?: string): NextRequest {
  return new Request("http://localhost/api/faq-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

// streamFaqAnswer는 SDK 이벤트가 아니라 텍스트 청크를 내는 경계로 바뀌었다.
// 라우트는 청크를 그대로 바이트로 흘린다.
function makeStream(text: string) {
  return (async function* () {
    yield text;
  })();
}

const VALID_BODY = { messages: [{ role: "user", content: "가입은 어떻게 하나요?" }] };

describe("POST /api/faq-chat", () => {
  beforeEach(() => {
    checkRateLimit.mockResolvedValue(OK);
    streamFaqAnswer.mockReturnValue(makeStream("이메일로 가입할 수 있습니다."));
  });
  afterEach(() => vi.clearAllMocks());

  it("Authorization이 없으면 토큰 검증 없이 비로그인으로 처리한다", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(verifyIdTokenFromRequest).not.toHaveBeenCalled();
    expect(streamFaqAnswer).toHaveBeenCalledWith(expect.anything(), {
      userId: null,
    });
  });

  it("유효한 토큰이면 그 uid를 도구 컨텍스트로 넘긴다", async () => {
    verifyIdTokenFromRequest.mockResolvedValue({ ok: true, uid: "user-42" });

    await POST(makeRequest(VALID_BODY, "good-token"));

    expect(streamFaqAnswer).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-42",
    });
  });

  // FAQ는 비로그인 접근이 본질이라, 토큰이 썩었다고 401로 막으면 안 된다.
  it("토큰이 유효하지 않아도 401이 아니라 비로그인으로 답한다", async () => {
    verifyIdTokenFromRequest.mockResolvedValue({
      ok: false,
      status: 401,
      message: "만료된 토큰",
    });

    const response = await POST(makeRequest(VALID_BODY, "expired-token"));

    expect(response.status).toBe(200);
    expect(streamFaqAnswer).toHaveBeenCalledWith(expect.anything(), {
      userId: null,
    });
  });

  it("정상 요청은 3단 rate limit을 통과하고 200 텍스트 스트림을 준다", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(3); // per-IP 분/일 + 전역
    expect(await response.text()).toContain("이메일로 가입");
  });

  it("messages가 없거나 잘못된 body는 400이고 LLM을 부르지 않는다", async () => {
    const noMessages = await POST(makeRequest({ foo: 1 }));
    expect(noMessages.status).toBe(400);

    const badJson = await POST(makeRequest("not-json"));
    expect(badJson.status).toBe(400);

    expect(streamFaqAnswer).not.toHaveBeenCalled();
  });

  it("per-IP 분당 한도 초과면 429이고 LLM을 부르지 않는다", async () => {
    checkRateLimit.mockReset().mockResolvedValueOnce(LIMITED);
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(429);
    expect(streamFaqAnswer).not.toHaveBeenCalled();
  });

  it("per-IP 일당 한도 초과면 429다", async () => {
    checkRateLimit
      .mockReset()
      .mockResolvedValueOnce(OK) // 분당 통과
      .mockResolvedValueOnce(LIMITED); // 일당 초과
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(429);
  });

  it("전역 일당 한도 초과면 429다", async () => {
    checkRateLimit
      .mockReset()
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce(LIMITED); // 전역 초과
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(429);
  });

  it("rate limit 계산이 실패하면 fail-closed(5xx)이고 LLM을 부르지 않는다", async () => {
    checkRateLimit.mockReset().mockRejectedValueOnce(new Error("DB down"));
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(streamFaqAnswer).not.toHaveBeenCalled();
  });

  it("스트림 시작 자체가 실패하면(키 부재 등) 5xx로 명시 응답한다", async () => {
    streamFaqAnswer.mockImplementation(() => {
      throw new Error("no key");
    });
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});
