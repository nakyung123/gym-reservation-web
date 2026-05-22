import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminOverview,
  type AdminReservationOverview,
} from "@/lib/admin/admin-overview-client";

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

describe("fetchAdminOverview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns overview data from a valid API response", async () => {
    const fetchMock = mockFetch(Response.json({ overview }));

    await expect(
      fetchAdminOverview(overview.date, "admin-token"),
    ).resolves.toEqual({
      ok: true,
      overview,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/overview?date=${overview.date}`,
      {
        headers: { "x-admin-token": "admin-token" },
        signal: undefined,
      },
    );
  });

  it("returns the API error message", async () => {
    mockFetch(
      Response.json(
        { message: "관리자 API 토큰이 올바르지 않습니다." },
        { status: 403 },
      ),
    );

    await expect(
      fetchAdminOverview(overview.date, "wrong-token"),
    ).resolves.toEqual({
      ok: false,
      message: "관리자 API 토큰이 올바르지 않습니다.",
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

    await expect(
      fetchAdminOverview(overview.date, "admin-token"),
    ).resolves.toEqual({
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

    const result = await fetchAdminOverview(overview.date, "admin-token");

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

    await expect(
      fetchAdminOverview(overview.date, "admin-token"),
    ).rejects.toBe(abortError);
  });
});
