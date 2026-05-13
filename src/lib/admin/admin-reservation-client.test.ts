import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminReservation,
  fetchAdminReservations,
  updateAdminReservationStatus,
} from "@/lib/admin/admin-reservation-client";
import type { Reservation } from "@/types/domain";

const reservation: Reservation = {
  id: "admin-reservation-client-test",
  userId: "admin-reservation-user",
  gymId: "admin-reservation-gym",
  sport: "배드민턴",
  date: "2026-05-20",
  time: "10:00",
  price: 12000,
  status: "reserved",
  createdAt: "2026-05-01T00:00:00.000Z",
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("admin reservation client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches reservation lists with encoded filters", async () => {
    const fetchMock = mockFetch(Response.json({ reservations: [reservation] }));

    await expect(
      fetchAdminReservations(
        {
          status: "reserved",
          gymId: reservation.gymId,
          date: reservation.date,
          userId: reservation.userId,
          limit: 10,
        },
        "admin-token",
      ),
    ).resolves.toEqual({ ok: true, reservations: [reservation] });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/reservations?status=reserved&gymId=${reservation.gymId}&date=${reservation.date}&userId=${reservation.userId}&limit=10`,
      {
        headers: { "x-admin-token": "admin-token" },
        signal: undefined,
      },
    );
  });

  it("rejects malformed reservation list responses", async () => {
    mockFetch(
      Response.json({
        reservations: [{ ...reservation, status: "unknown" }],
      }),
    );

    await expect(
      fetchAdminReservations({}, "admin-token"),
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
    });
  });

  it("fetches a reservation detail from a valid API response", async () => {
    const fetchMock = mockFetch(Response.json({ reservation }));

    await expect(
      fetchAdminReservation(reservation.id, "admin-token"),
    ).resolves.toEqual({ ok: true, reservation });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/reservations/${reservation.id}`,
      {
        headers: { "x-admin-token": "admin-token" },
        signal: undefined,
      },
    );
  });

  it("maps successful reservation status updates", async () => {
    const usedReservation = { ...reservation, status: "used" as const };
    const fetchMock = mockFetch(
      Response.json({
        status: "used",
        reservation: usedReservation,
        message: "예약이 이용 완료 처리되었습니다.",
      }),
    );

    await expect(
      updateAdminReservationStatus(reservation.id, "used", "admin-token"),
    ).resolves.toEqual({
      ok: true,
      status: "used",
      reservation: usedReservation,
      message: "예약이 이용 완료 처리되었습니다.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/reservations/${reservation.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": "admin-token",
        },
        body: JSON.stringify({ status: "used" }),
        signal: undefined,
      },
    );
  });

  it("keeps reservation details from failed status updates", async () => {
    const usedReservation = { ...reservation, status: "used" as const };
    mockFetch(
      Response.json(
        {
          status: "not-cancellable",
          reservation: usedReservation,
          message: "이용 완료 상태의 예약은 취소할 수 없습니다.",
        },
        { status: 409 },
      ),
    );

    await expect(
      updateAdminReservationStatus(reservation.id, "cancelled", "admin-token"),
    ).resolves.toEqual({
      ok: false,
      message: "이용 완료 상태의 예약은 취소할 수 없습니다.",
      status: 409,
      reservation: usedReservation,
    });
  });

  it("rejects successful status update responses with mismatched reservation status", async () => {
    mockFetch(
      Response.json({
        status: "used",
        reservation,
        message: "status mismatch",
      }),
    );

    await expect(
      updateAdminReservationStatus(reservation.id, "used", "admin-token"),
    ).resolves.toEqual({
      ok: false,
      message: "status mismatch",
      status: 200,
      reservation,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      fetchAdminReservation(reservation.id, "admin-token"),
    ).rejects.toBe(abortError);
  });
});
