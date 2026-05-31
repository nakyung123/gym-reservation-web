import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  createAdminGym,
  fetchAdminGyms,
  updateAdminGym,
} from "@/lib/admin/admin-gym-client";
import { ADMIN_GYM_SPORTS } from "@/lib/admin/admin-gym-schema";
import type { AdminGym } from "@/types/domain";

vi.mock("@/lib/admin/admin-auth-headers", () => ({
  getAdminAuthHeader: vi.fn(),
}));

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

function setAuthHeaderOk(idToken = "test-id-token") {
  vi.mocked(getAdminAuthHeader).mockResolvedValue({
    ok: true,
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("admin gym client", () => {
  beforeEach(() => {
    setAuthHeaderOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("Authorization: Bearer 헤더로 시설 목록을 조회한다", async () => {
    const fetchMock = mockFetch(Response.json({ gyms: [gym] }));

    await expect(fetchAdminGyms()).resolves.toEqual({
      ok: true,
      gyms: [gym],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/gyms", {
      headers: { Authorization: "Bearer test-id-token" },
      signal: undefined,
    });
  });

  it("로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAdminGyms()).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed admin gym list responses", async () => {
    mockFetch(Response.json({ gyms: [{ ...gym, isActive: "true" }] }));

    await expect(fetchAdminGyms()).resolves.toMatchObject({
      ok: false,
      status: 200,
    });
  });

  it("creates an admin gym from a valid mutation response", async () => {
    const fetchMock = mockFetch(
      Response.json({ gym, message: "시설 정보가 저장되었습니다." }),
    );

    await expect(createAdminGym(gym)).resolves.toEqual({
      ok: true,
      gym,
      message: "시설 정보가 저장되었습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/gyms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-id-token",
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
      updateAdminGym(gym.id, { ...gym, officialUrl: "ftp://example.com" }),
    ).resolves.toEqual({
      ok: false,
      message: "공식 URL은 http 또는 https 주소여야 합니다.",
      status: 400,
    });
  });

  it("시설 목록 실패 응답의 안전한 서버 message를 보존한다", async () => {
    mockFetch(
      Response.json(
        { message: "시설 목록을 불러오지 못했습니다." },
        { status: 500 },
      ),
    );

    await expect(fetchAdminGyms()).resolves.toEqual({
      ok: false,
      message: "시설 목록을 불러오지 못했습니다.",
      status: 500,
    });
  });

  it("시설 목록 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await fetchAdminGyms();

    expect(result).toEqual({
      ok: false,
      message: "시설 목록 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("성공 status여도 시설 저장 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        gym: { ...gym, basePrice: "12000" },
        message: "시설 정보가 저장되었습니다.",
      }),
    );

    await expect(createAdminGym(gym)).resolves.toEqual({
      ok: false,
      message: "시설 저장 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled list requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchAdminGyms()).rejects.toBe(abortError);
  });
});
