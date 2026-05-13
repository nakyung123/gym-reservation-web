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

  it("rejects malformed overview response shapes", async () => {
    mockFetch(
      Response.json({
        overview: {
          ...overview,
          revenue: { expected: "24000", used: 12000 },
        },
      }),
    );

    await expect(
      fetchAdminOverview(overview.date, "admin-token"),
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
    });
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
