import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUserReservation } from "@/lib/reservation-detail-client";
import { createUserReservationDetail } from "@/lib/reservation-detail";
import type { Gym, Reservation } from "@/types/domain";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

const reservation: Reservation = {
  id: "reservation-detail-test",
  userId: "reservation-detail-user",
  gymId: "reservation-detail-gym",
  sport: "배드민턴",
  date: "2026-05-20",
  time: "10:00",
  price: 12000,
  status: "reserved",
  createdAt: "2026-05-01T00:00:00.000Z",
};
const detail = createUserReservationDetail(reservation, {
  now: new Date("2026-05-19T00:00:00.000Z"),
});
const gym: Gym = {
  id: reservation.gymId,
  name: "Reservation Detail Gym",
  region: "Reservation Detail Region",
  address: "1 Detail Road",
  officialUrl: "https://example.com/detail-gym",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "Reservation detail client test gym",
  latitude: 37.5665,
  longitude: 126.978,
  sports: [reservation.sport],
  sportPrices: { [reservation.sport]: reservation.price },
  facilities: ["locker"],
  availableTimes: [reservation.time],
  closedDays: [],
};

function mockCurrentUser(token = "id-token") {
  getFirebaseClient.mockReturnValue({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(token),
      },
    },
  });
}

function mockCurrentUserTokenError(message = "token unavailable") {
  getFirebaseClient.mockReturnValue({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockRejectedValue(new Error(message)),
      },
    },
  });
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchUserReservation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("returns auth-required without calling the API when no user is signed in", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUserReservation(reservation.id)).resolves.toMatchObject({
      ok: false,
      kind: "auth-required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ID 토큰 획득 실패는 Firebase 원문을 노출하지 않는다", async () => {
    mockCurrentUserTokenError();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUserReservation(reservation.id);

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("token unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the reservation from a valid API response", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(Response.json({ reservation, detail, gym }));

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: true,
      reservation,
      detail,
      gym,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reservations/${reservation.id}`,
      {
        headers: { Authorization: "Bearer id-token" },
        signal: undefined,
      },
    );
  });

  it("maps 404 responses to not-found", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "예약을 찾을 수 없습니다." },
        { status: 404 },
      ),
    );

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: false,
      kind: "not-found",
      message: "예약을 찾을 수 없습니다.",
      status: 404,
    });
  });

  it("maps 401 responses to auth-required", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "ID 토큰 검증에 실패했습니다." },
        { status: 401 },
      ),
    );

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: false,
      kind: "auth-required",
      message: "ID 토큰 검증에 실패했습니다.",
      status: 401,
    });
  });

  it("rejects malformed reservation response shapes", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        reservation: { ...reservation, status: "bad" },
        detail,
        gym,
      }),
    );

    await expect(fetchUserReservation(reservation.id)).resolves.toMatchObject({
      ok: false,
      kind: "error",
    });
  });

  it("rejects malformed detail response shapes", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        reservation,
        gym,
        detail: {
          ...detail,
          admission: { ...detail.admission, active: "yes" },
        },
      }),
    );

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "예약 상세 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("rejects malformed gym response shapes", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json({
        reservation,
        detail,
        gym: { ...gym, sports: ["baseball"] },
      }),
    );

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "예약 상세 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    mockCurrentUser();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchUserReservation(reservation.id)).rejects.toBe(abortError);
  });

  it("예약 상세 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await fetchUserReservation(reservation.id);

    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "예약 상세 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });
});
