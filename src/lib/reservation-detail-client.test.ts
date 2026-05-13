import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUserReservation } from "@/lib/reservation-detail-client";
import type { Reservation } from "@/types/domain";

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

function mockCurrentUser(token = "id-token") {
  getFirebaseClient.mockReturnValue({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(token),
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

  it("returns the reservation from a valid API response", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(Response.json({ reservation }));

    await expect(fetchUserReservation(reservation.id)).resolves.toEqual({
      ok: true,
      reservation,
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
    mockFetch(Response.json({ reservation: { ...reservation, status: "bad" } }));

    await expect(fetchUserReservation(reservation.id)).resolves.toMatchObject({
      ok: false,
      kind: "error",
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    mockCurrentUser();
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchUserReservation(reservation.id)).rejects.toBe(abortError);
  });
});
