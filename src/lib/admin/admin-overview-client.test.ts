import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  fetchAdminOverview,
  fetchAdminOverviewTrend,
  type AdminReservationOverview,
  type AdminReservationTrendPoint,
} from "@/lib/admin/admin-overview-client";

vi.mock("@/lib/admin/admin-auth-headers", () => ({
  getAdminAuthHeader: vi.fn(),
}));

const overview: AdminReservationOverview = {
  date: "2026-05-20",
  reservations: {
    total: 3,
    reserved: 1,
    cancelled: 1,
    used: 1,
  },
  revenue: {
    expected: 24000,
    used: 12000,
  },
  slots: {
    total: 4,
    available: 3,
    full: 0,
    closed: 1,
    reservedCount: 2,
    capacity: 14,
  },
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setAuthHeaderOk(idToken = "test-id-token") {
  vi.mocked(getAdminAuthHeader).mockResolvedValue({
    ok: true,
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("fetchAdminOverview", () => {
  beforeEach(() => {
    setAuthHeaderOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("Authorization: Bearer 헤더로 운영 요약을 조회한다", async () => {
    const fetchMock = mockFetch(Response.json({ overview }));

    await expect(fetchAdminOverview(overview.date)).resolves.toEqual({
      ok: true,
      overview,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/overview?date=${overview.date}`,
      {
        headers: { Authorization: "Bearer test-id-token" },
        signal: undefined,
      },
    );
  });

  it("로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAdminOverview(overview.date)).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the API error message", async () => {
    mockFetch(
      Response.json(
        { message: "관리자 권한이 없습니다." },
        { status: 403 },
      ),
    );

    await expect(fetchAdminOverview(overview.date)).resolves.toEqual({
      ok: false,
      message: "관리자 권한이 없습니다.",
      status: 403,
    });
  });

  it("성공 status여도 운영 요약 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        overview: {
          ...overview,
          revenue: { expected: "24000", used: 12000 },
        },
        message: "운영 요약을 불러왔습니다.",
      }),
    );

    await expect(fetchAdminOverview(overview.date)).resolves.toEqual({
      ok: false,
      message: "관리자 운영 요약 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("운영 요약 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await fetchAdminOverview(overview.date);

    expect(result).toEqual({
      ok: false,
      message: "관리자 운영 요약 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchAdminOverview(overview.date)).rejects.toBe(abortError);
  });
});

describe("fetchAdminOverviewTrend", () => {
  const trend: AdminReservationTrendPoint[] = [
    { date: "2026-05-19", reserved: 0, cancelled: 0, used: 0 },
    { date: "2026-05-20", reserved: 2, cancelled: 1, used: 1 },
  ];

  beforeEach(() => {
    setAuthHeaderOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("Authorization: Bearer 헤더로 예약 추이를 조회한다", async () => {
    const fetchMock = mockFetch(Response.json({ trend }));

    await expect(
      fetchAdminOverviewTrend("2026-05-19", "2026-05-20"),
    ).resolves.toEqual({ ok: true, trend });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/overview/trend?from=2026-05-19&to=2026-05-20",
      {
        headers: { Authorization: "Bearer test-id-token" },
        signal: undefined,
      },
    );
  });

  it("로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAdminOverviewTrend("2026-05-19", "2026-05-20"),
    ).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the API error message", async () => {
    mockFetch(
      Response.json({ message: "관리자 권한이 없습니다." }, { status: 403 }),
    );

    await expect(
      fetchAdminOverviewTrend("2026-05-19", "2026-05-20"),
    ).resolves.toEqual({
      ok: false,
      message: "관리자 권한이 없습니다.",
      status: 403,
    });
  });

  it("성공 status여도 추이 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        trend: [{ date: "2026-05-20", reserved: "2", cancelled: 1, used: 1 }],
      }),
    );

    await expect(
      fetchAdminOverviewTrend("2026-05-19", "2026-05-20"),
    ).resolves.toEqual({
      ok: false,
      message: "예약 추이 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      fetchAdminOverviewTrend("2026-05-19", "2026-05-20"),
    ).rejects.toBe(abortError);
  });
});
