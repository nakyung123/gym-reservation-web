import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/kakao/start/route";
import { createAttempt } from "@/lib/server/oauth/attempt-store";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/oauth/attempt-store", () => ({
  createAttempt: vi.fn(),
  OAUTH_ATTEMPT_TTL_MS: 5 * 60 * 1000,
}));

const cookiesMock = vi.mocked(cookies);
const createAttemptMock = vi.mocked(createAttempt);

function postRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/kakao/start", {
    method: "POST",
  });
}

describe("POST /api/auth/kakao/start", () => {
  beforeEach(() => {
    createAttemptMock.mockResolvedValue({
      attemptId: "attempt-id",
      state: "state-token",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    cookiesMock.mockResolvedValue({
      set: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("환경변수가 누락되면 설정 내부 정보를 응답에 노출하지 않는다", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    vi.stubEnv("KAKAO_REDIRECT_URI", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postRequest());
    const body = (await response.json()) as { message?: unknown };

    expect(response.status).toBe(500);
    expect(body.message).toBe(
      "카카오 로그인을 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(body.message).not.toContain("KAKAO_REST_API_KEY");
  });
});
