import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/ledger-sync/route";
import { syncReservationLedger } from "@/lib/server/sheets-ledger";

// sheets-ledger(googleapis/prisma 의존)를 모킹해 DB/네트워크 없이 인증 가드와 실패 처리만 검증한다.
// vitest.unit.config.ts include 대상.
vi.mock("@/lib/server/sheets-ledger", () => ({
  syncReservationLedger: vi.fn(),
}));

const SECRET = "test-cron-secret";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/ledger-sync", {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/cron/ledger-sync", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.mocked(syncReservationLedger).mockResolvedValue({
      reservations: 3,
      detailRows: 4,
      summaryRows: 20,
    });
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

  it("CRON_SECRET이 없으면 500이고 동기화하지 않는다", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(syncReservationLedger).not.toHaveBeenCalled();
  });

  it("Authorization이 없거나 틀리면 401이고 동기화하지 않는다", async () => {
    const noAuth = await GET(request());
    expect(noAuth.status).toBe(401);

    const wrong = await GET(request("Bearer wrong-secret"));
    expect(wrong.status).toBe(401);

    expect(syncReservationLedger).not.toHaveBeenCalled();
  });

  it("올바른 시크릿이면 동기화하고 200 + 결과를 준다", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      reservations: 3,
      detailRows: 4,
      summaryRows: 20,
    });
  });

  it("동기화가 실패하면 200으로 위장하지 않고 500을 준다", async () => {
    vi.mocked(syncReservationLedger).mockRejectedValue(new Error("Sheets down"));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false });
  });
});
