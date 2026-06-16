import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Anthropic SDK를 모킹해 네트워크/실제 키 없이 프롬프트 구성·파싱·best-effort 폴백을 검증한다.
// vitest.unit.config.ts include 대상.
const parseMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: parseMock };
  },
}));
// zodOutputFormat은 format 객체만 만들어 주면 되므로 형태만 stub한다(스키마 변환 검증 대상 아님).
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: vi.fn(() => ({ type: "json_schema" })),
}));

import {
  generateDailyBrief,
  scrubPii,
  type AiBriefInput,
} from "@/lib/server/ai-brief";

const INPUT: AiBriefInput = {
  yesterdayKstDate: "2026-06-15",
  metrics: {
    newReservations: 12,
    bookedValueWon: 148000,
    newSignups: 3,
    newFavorites: 5,
    withdrawals: 2,
  },
  baseline: {
    reservationsPerDay: 10,
    signupsPerDay: 2,
    favoritesPerDay: 4,
    withdrawalsPerDay: 0.3,
  },
  withdrawalReasons: [
    { category: "가격", detail: "너무 비싸요. 010-1234-5678 로 연락주세요" },
    { category: "시설", detail: "샤워실이 더러움 test@example.com" },
    { category: "기타", detail: null },
  ],
};

describe("scrubPii", () => {
  it("전화번호와 이메일을 마스킹한다", () => {
    const out = scrubPii("연락처 010-1234-5678, 메일 a.b@test.co.kr 입니다");
    expect(out).not.toContain("010-1234-5678");
    expect(out).not.toContain("a.b@test.co.kr");
    expect(out).toContain("[번호 제거]");
    expect(out).toContain("[이메일 제거]");
  });
});

describe("generateDailyBrief", () => {
  const original = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockReset();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = original;
    }
    vi.clearAllMocks();
  });

  it("키가 없으면 API를 호출하지 않고 null을 돌려준다", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await generateDailyBrief(INPUT)).toBeNull();
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("parsed_output을 그대로 돌려주고, PII는 스크럽돼 전송된다", async () => {
    parseMock.mockResolvedValue({
      parsed_output: {
        briefing: "어제는 평소 수준이었습니다.",
        anomalies: [],
        withdrawalThemes: ["가격 부담", "시설 불만"],
      },
    });

    const result = await generateDailyBrief(INPUT);
    expect(result).toEqual({
      briefing: "어제는 평소 수준이었습니다.",
      anomalies: [],
      withdrawalThemes: ["가격 부담", "시설 불만"],
    });

    // 제3자(Anthropic)로 보낸 프롬프트에 raw PII가 없어야 한다(입력 egress 최소화).
    const sent = parseMock.mock.calls[0][0].messages[0].content as string;
    expect(sent).not.toContain("010-1234-5678");
    expect(sent).not.toContain("test@example.com");
    expect(sent).toContain("[번호 제거]");
    expect(sent).toContain("[이메일 제거]");
    // 숫자/baseline이 프롬프트에 포함된다.
    expect(sent).toContain("신규 예약: 12건");
    expect(sent).toContain("예약 10/일");
  });

  it("호출 파라미터(모델·구조화출력·effort·timeout)를 고정한다(B2 설정 회귀 방지)", async () => {
    parseMock.mockResolvedValue({
      parsed_output: { briefing: "x", anomalies: [], withdrawalThemes: [] },
    });
    await generateDailyBrief(INPUT);

    const [body, options] = parseMock.mock.calls[0];
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(1024);
    expect(body.output_config.format).toBeDefined();
    expect(body.output_config.effort).toBe("low");
    // thinking은 명시하지 않는다(기본 off). budget_tokens도 보내지 않는다.
    expect(body.thinking).toBeUndefined();
    expect(options).toMatchObject({ timeout: 15000 });
  });

  it("parsed_output이 null이면 null을 돌려준다(스키마 검증 실패 폴백)", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });
    expect(await generateDailyBrief(INPUT)).toBeNull();
  });

  it("API 호출이 throw해도 throw하지 않고 null을 돌려준다(best-effort)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new Error("network down"));
    expect(await generateDailyBrief(INPUT)).toBeNull();
  });
});
