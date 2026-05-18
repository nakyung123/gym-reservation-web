import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminGym,
  fetchAdminGyms,
  updateAdminGym,
} from "@/lib/admin/admin-gym-client";
import { ADMIN_GYM_SPORTS } from "@/lib/admin/admin-gym-schema";
import type { AdminGym } from "@/types/domain";

const sport = ADMIN_GYM_SPORTS[0];

const gym: AdminGym = {
  id: "admin-gym-client-test",
  name: "관리자 클라이언트 테스트 체육관",
  region: "서울 테스트구",
  address: "테스트로 1",
  officialUrl: "https://example.com/gym",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "관리자 시설 클라이언트 응답 검증용 체육관입니다.",
  distanceKm: 1.25,
  latitude: 37.5665,
  longitude: 126.978,
  sports: [sport],
  sportPrices: {
    [sport]: 12000,
  },
  facilities: ["샤워실"],
  availableTimes: ["10:00", "11:00"],
  closedDays: [],
  isActive: true,
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("admin gym client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches admin gyms from a valid API response", async () => {
    const fetchMock = mockFetch(Response.json({ gyms: [gym] }));

    await expect(fetchAdminGyms("admin-token")).resolves.toEqual({
      ok: true,
      gyms: [gym],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/gyms", {
      headers: { "x-admin-token": "admin-token" },
      signal: undefined,
    });
  });

  it("rejects malformed admin gym list responses", async () => {
    mockFetch(Response.json({ gyms: [{ ...gym, isActive: "true" }] }));

    await expect(fetchAdminGyms("admin-token")).resolves.toMatchObject({
      ok: false,
      status: 200,
    });
  });

  it("creates an admin gym from a valid mutation response", async () => {
    const fetchMock = mockFetch(
      Response.json({ gym, message: "시설 정보가 저장되었습니다." }),
    );

    await expect(createAdminGym(gym, "admin-token")).resolves.toEqual({
      ok: true,
      gym,
      message: "시설 정보가 저장되었습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/gyms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": "admin-token",
      },
      body: JSON.stringify(gym),
    });
  });

  it("returns API validation errors from mutation responses", async () => {
    mockFetch(
      Response.json(
        { message: "공식 URL은 http 또는 https 주소여야 합니다." },
        { status: 400 },
      ),
    );

    await expect(
      updateAdminGym(gym.id, { ...gym, officialUrl: "ftp://example.com" }, "admin-token"),
    ).resolves.toEqual({
      ok: false,
      message: "공식 URL은 http 또는 https 주소여야 합니다.",
      status: 400,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled list requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchAdminGyms("admin-token")).rejects.toBe(abortError);
  });
});
