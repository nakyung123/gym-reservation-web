import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/daily-report/route";
import { buildDailyReport } from "@/lib/server/daily-report";
import { notifySlack } from "@/lib/server/notify-slack";

// daily-report(prisma 의존)와 notify-slack(fetch 의존)을 모킹해 DB/네트워크 없이
// 인증 가드와 부분 실패 처리만 검증한다. vitest.unit.config.ts include 대상.
vi.mock("@/lib/server/daily-report", () => ({ buildDailyReport: vi.fn() }));
vi.mock("@/lib/server/notify-slack", () => ({ notifySlack: vi.fn() }));

const SECRET = "test-cron-secret";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/daily-report", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cron/daily-report", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.mocked(buildDailyReport).mockResolvedValue({
      data: {
        yesterdayKstDate: "2026-06-15",
        todayKstDate: "2026-06-16",
        newReservations: 1,
        bookedValueWon: 12000,
        newSignups: 0,
        newFavorites: 0,
        withdrawals: 0,
        todayReservedCount: 0,
      },
      text: "리포트 본문",
    });
    vi.mocked(notifySlack).mockResolvedValue(undefined);
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    vi.clearAllMocks();
  });

  it("CRON_SECRET이 없으면 500이고 리포트를 만들지 않는다", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(buildDailyReport).not.toHaveBeenCalled();
  });

  it("Authorization이 없거나 틀리면 401이고 리포트를 만들지 않는다", async () => {
    const noAuth = await GET(request());
    expect(noAuth.status).toBe(401);

    const wrong = await GET(request("Bearer wrong-secret"));
    expect(wrong.status).toBe(401);

    expect(buildDailyReport).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it("올바른 시크릿이면 리포트를 만들어 Slack으로 보내고 200을 준다", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, date: "2026-06-15" });
    expect(notifySlack).toHaveBeenCalledWith("리포트 본문");
  });

  it("Slack 전송이 실패하면 200으로 위장하지 않고 500을 준다", async () => {
    vi.mocked(notifySlack).mockRejectedValue(new Error("Slack down"));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
  });
});
