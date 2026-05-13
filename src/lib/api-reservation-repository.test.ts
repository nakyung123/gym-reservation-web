import { afterEach, describe, expect, it, vi } from "vitest";
import { apiReservationRepository } from "@/lib/api-reservation-repository";
import type { Reservation, ReservationSlotAvailability } from "@/types/domain";

const { getFirebaseClient } = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("@/lib/firebase-auth-session", () => ({
  getCurrentFirebaseAuthSession: vi.fn(() => ({
    ok: false,
    reason: "not-ready",
    message: "인증 상태를 확인하는 중입니다.",
  })),
  subscribeFirebaseAuthSession: vi.fn(() => vi.fn()),
}));

const reservation: Reservation = {
  id: "api-reservation-repository-test",
  userId: "api-reservation-user",
  gymId: "api-reservation-gym",
  sport: "배드민턴",
  date: "2026-05-20",
  time: "10:00",
  price: 12000,
  status: "reserved",
  createdAt: "2026-05-01T00:00:00.000Z",
};

const slot: ReservationSlotAvailability = {
  gymId: reservation.gymId,
  sport: reservation.sport,
  date: reservation.date,
  time: reservation.time,
  capacity: 4,
  reservedCount: 4,
  remaining: 0,
  isClosed: false,
  status: "full",
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

describe("apiReservationRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
  });

  it("returns auth-required when creating without a signed-in user", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });

    await expect(
      apiReservationRepository.create(reservation),
    ).resolves.toMatchObject({
      ok: false,
      status: "failed",
      reason: "auth-required",
    });
  });

  it("maps created reservation responses", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      Response.json(
        { status: "created", reservation },
        { status: 201 },
      ),
    );

    await expect(
      apiReservationRepository.create(reservation),
    ).resolves.toEqual({
      ok: true,
      status: "created",
      reservation,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/reservations", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gymId: reservation.gymId,
        sport: reservation.sport,
        date: reservation.date,
        time: reservation.time,
      }),
    });
  });

  it("maps full slot responses without creating a local success", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        {
          status: "full",
          slot,
          message: "선택한 시간대는 예약 정원이 마감되었습니다.",
        },
        { status: 409 },
      ),
    );

    await expect(
      apiReservationRepository.create(reservation),
    ).resolves.toEqual({
      ok: false,
      status: "full",
      message: "선택한 시간대는 예약 정원이 마감되었습니다.",
      slot,
    });
  });

  it("returns remote-unavailable for create network failures", async () => {
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(
      apiReservationRepository.create(reservation),
    ).resolves.toMatchObject({
      ok: false,
      status: "failed",
      reason: "remote-unavailable",
      message: expect.stringContaining("network down"),
    });
  });

  it("maps cancelled reservation responses", async () => {
    mockCurrentUser();
    const cancelled = { ...reservation, status: "cancelled" as const };
    const fetchMock = mockFetch(
      Response.json({
        status: "cancelled",
        reservation: cancelled,
        message: "예약을 취소했습니다.",
      }),
    );

    await expect(
      apiReservationRepository.cancel(reservation.id),
    ).resolves.toMatchObject({
      ok: true,
      status: "cancelled",
      reservation: cancelled,
      message: "예약을 취소했습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reservations/${reservation.id}`,
      {
        method: "DELETE",
        headers: { Authorization: "Bearer id-token" },
      },
    );
  });
});
