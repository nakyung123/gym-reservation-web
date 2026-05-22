import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchReservationSlots,
  isReservationSlotAvailability,
} from "@/lib/reservation-slot-availability";
import type { ReservationSlotAvailability, Sport } from "@/types/domain";

const sport = "배드민턴" as Sport;

const slot: ReservationSlotAvailability = {
  gymId: "slot-test-gym",
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

describe("isReservationSlotAvailability", () => {
  it("validates the public slot availability response shape", () => {
    expect(isReservationSlotAvailability(slot)).toBe(true);
    expect(
      isReservationSlotAvailability({ ...slot, status: "unknown" }),
    ).toBe(false);
    expect(
      isReservationSlotAvailability({ ...slot, remaining: "3" }),
    ).toBe(false);
  });
});

describe("fetchReservationSlots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns slots from a valid API response", async () => {
    const fetchMock = mockFetch(
      Response.json({ slots: [slot] }, { status: 200 }),
    );

    await expect(
      fetchReservationSlots({
        gymId: slot.gymId,
        sport,
        date: slot.date,
      }),
    ).resolves.toEqual({ ok: true, slots: [slot] });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reservation-slots?gymId=${slot.gymId}&sport=${encodeURIComponent(sport)}&date=${slot.date}`,
      { signal: undefined },
    );
  });

  it("returns the API error message without falling back to empty slots", async () => {
    mockFetch(Response.json({ message: "조회 조건이 올바르지 않습니다." }, { status: 400 }));

    await expect(
      fetchReservationSlots({
        gymId: slot.gymId,
        sport,
        date: "2026/05/20",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "조회 조건이 올바르지 않습니다.",
    });
  });

  it("rejects malformed slot response shapes", async () => {
    mockFetch(Response.json({ slots: [{ ...slot, remaining: "3" }] }));

    await expect(
      fetchReservationSlots({
        gymId: slot.gymId,
        sport,
        date: slot.date,
      }),
    ).resolves.toMatchObject({
      ok: false,
    });
  });

  it("network failure 원문을 사용자 메시지에 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await fetchReservationSlots({
      gymId: slot.gymId,
      sport,
      date: slot.date,
    });

    expect(result).toEqual({
      ok: false,
      message: "슬롯 정보를 불러오지 못했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("network down");
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      fetchReservationSlots({
        gymId: slot.gymId,
        sport,
        date: slot.date,
      }),
    ).rejects.toBe(abortError);
  });
});
