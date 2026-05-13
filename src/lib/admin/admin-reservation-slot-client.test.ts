import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bulkUpdateReservationSlotPolicy,
  updateReservationSlotPolicy,
} from "@/lib/admin/admin-reservation-slot-client";
import type { ReservationSlotAvailability, Sport } from "@/types/domain";

const sport = "배드민턴" as Sport;

const slot: ReservationSlotAvailability = {
  gymId: "admin-slot-client-gym",
  sport,
  date: "2026-05-20",
  time: "10:00",
  capacity: 4,
  reservedCount: 1,
  remaining: 3,
  isClosed: false,
  status: "available",
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("admin reservation slot client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates a single slot policy from a valid API response", async () => {
    const fetchMock = mockFetch(Response.json({ slot }));

    await expect(
      updateReservationSlotPolicy(
        {
          gymId: slot.gymId,
          sport,
          date: slot.date,
          time: slot.time,
          capacity: 4,
        },
        "admin-token",
      ),
    ).resolves.toEqual({ ok: true, slot });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/reservation-slots", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": "admin-token",
      },
      body: JSON.stringify({
        gymId: slot.gymId,
        sport,
        date: slot.date,
        time: slot.time,
        capacity: 4,
      }),
      signal: undefined,
    });
  });

  it("rejects malformed single-slot success responses", async () => {
    mockFetch(Response.json({ slot: { ...slot, status: "unknown" } }));

    await expect(
      updateReservationSlotPolicy(
        {
          gymId: slot.gymId,
          sport,
          date: slot.date,
          time: slot.time,
          isClosed: true,
        },
        "admin-token",
      ),
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
    });
  });

  it("maps valid bulk conflict responses without losing conflict details", async () => {
    mockFetch(
      Response.json(
        {
          status: "conflict",
          message: "이미 예약된 슬롯이 있습니다.",
          conflicts: [slot],
        },
        { status: 409 },
      ),
    );

    await expect(
      bulkUpdateReservationSlotPolicy(
        {
          gymId: slot.gymId,
          sport,
          dates: [slot.date],
          times: [slot.time],
          capacity: 1,
        },
        "admin-token",
      ),
    ).resolves.toEqual({
      ok: false,
      kind: "conflict",
      message: "이미 예약된 슬롯이 있습니다.",
      conflicts: [slot],
      status: 409,
    });
  });

  it("rejects malformed bulk conflict responses", async () => {
    mockFetch(
      Response.json(
        {
          status: "conflict",
          conflicts: [{ ...slot, remaining: "3" }],
        },
        { status: 409 },
      ),
    );

    await expect(
      bulkUpdateReservationSlotPolicy(
        {
          gymId: slot.gymId,
          sport,
          dates: [slot.date],
          times: [slot.time],
          isClosed: true,
        },
        "admin-token",
      ),
    ).resolves.toMatchObject({
      ok: false,
      kind: "error",
      status: 409,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      bulkUpdateReservationSlotPolicy(
        {
          gymId: slot.gymId,
          sport,
          dates: [slot.date],
          times: [slot.time],
          isClosed: true,
        },
        "admin-token",
      ),
    ).rejects.toBe(abortError);
  });
});
