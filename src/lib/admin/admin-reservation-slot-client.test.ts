import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  bulkUpdateReservationSlotPolicy,
  updateReservationSlotPolicy,
} from "@/lib/admin/admin-reservation-slot-client";
import type { ReservationSlotAvailability, Sport } from "@/types/domain";

vi.mock("@/lib/admin/admin-auth-headers", () => ({
  getAdminAuthHeader: vi.fn(),
}));

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

function setAuthHeaderOk(idToken = "test-id-token") {
  vi.mocked(getAdminAuthHeader).mockResolvedValue({
    ok: true,
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("admin reservation slot client", () => {
  beforeEach(() => {
    setAuthHeaderOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("Authorization: Bearer 헤더로 단일 슬롯 정책을 변경한다", async () => {
    const fetchMock = mockFetch(Response.json({ slot }));

    await expect(
      updateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        date: slot.date,
        time: slot.time,
        capacity: 4,
      }),
    ).resolves.toEqual({ ok: true, slot });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/reservation-slots", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-id-token",
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

  it("단일 슬롯: 로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        date: slot.date,
        time: slot.time,
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("성공 status여도 단일 슬롯 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        slot: { ...slot, status: "unknown" },
        message: "슬롯 정책이 변경되었습니다.",
      }),
    );

    await expect(
      updateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        date: slot.date,
        time: slot.time,
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "슬롯 정책 변경 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("단일 슬롯 변경 실패 시 서버 메시지를 유지한다", async () => {
    mockFetch(
      Response.json(
        { message: "체육관 정보를 불러오지 못했습니다." },
        { status: 500 },
      ),
    );

    await expect(
      updateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        date: slot.date,
        time: slot.time,
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "체육관 정보를 불러오지 못했습니다.",
      status: 500,
    });
  });

  it("단일 슬롯 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await updateReservationSlotPolicy({
      gymId: slot.gymId,
      sport,
      date: slot.date,
      time: slot.time,
      isClosed: true,
    });

    expect(result).toEqual({
      ok: false,
      message: "슬롯 정책 변경 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("Authorization: Bearer 헤더로 일괄 슬롯 정책을 변경한다", async () => {
    const secondSlot = { ...slot, date: "2026-05-21", time: "11:00" };
    const fetchMock = mockFetch(
      Response.json({
        slots: [slot, secondSlot],
        updatedCount: 2,
      }),
    );

    await expect(
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date, secondSlot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: true,
      slots: [slot, secondSlot],
      updatedCount: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/reservation-slots/bulk",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-id-token",
        },
        body: JSON.stringify({
          gymId: slot.gymId,
          sport,
          dates: [slot.date, secondSlot.date],
          times: [slot.time],
          isClosed: true,
        }),
        signal: undefined,
      },
    );
  });

  it("일괄 슬롯: 로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bulk success responses with mismatched update counts", async () => {
    mockFetch(
      Response.json({
        slots: [slot],
        updatedCount: 2,
      }),
    );

    await expect(
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      kind: "error",
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
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        capacity: 1,
      }),
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
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      kind: "error",
      status: 409,
    });
  });

  it("일괄 슬롯 변경 실패 시 서버 메시지를 유지한다", async () => {
    mockFetch(
      Response.json(
        { message: "슬롯 정책을 일괄 변경하지 못했습니다." },
        { status: 500 },
      ),
    );

    await expect(
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).resolves.toEqual({
      ok: false,
      kind: "error",
      message: "슬롯 정책을 일괄 변경하지 못했습니다.",
      status: 500,
    });
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      bulkUpdateReservationSlotPolicy({
        gymId: slot.gymId,
        sport,
        dates: [slot.date],
        times: [slot.time],
        isClosed: true,
      }),
    ).rejects.toBe(abortError);
  });
});
