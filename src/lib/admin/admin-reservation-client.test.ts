import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminAuthHeader } from "@/lib/admin/admin-auth-headers";
import {
  fetchAdminReservation,
  fetchAdminReservations,
  updateAdminReservationStatus,
} from "@/lib/admin/admin-reservation-client";
import type { Reservation } from "@/types/domain";

vi.mock("@/lib/admin/admin-auth-headers", () => ({
  getAdminAuthHeader: vi.fn(),
}));

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

function setAuthHeaderOk(idToken = "test-id-token") {
  vi.mocked(getAdminAuthHeader).mockResolvedValue({
    ok: true,
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

describe("admin reservation client", () => {
  beforeEach(() => {
    setAuthHeaderOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("Authorization: Bearer 헤더와 인코딩된 필터로 예약 목록을 조회한다", async () => {
    const fetchMock = mockFetch(Response.json({ reservations: [reservation] }));

    await expect(
      fetchAdminReservations({
        status: "reserved",
        gymId: reservation.gymId,
        date: reservation.date,
        userId: reservation.userId,
        limit: 10,
      }),
    ).resolves.toEqual({ ok: true, reservations: [reservation] });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/reservations?status=reserved&gymId=${reservation.gymId}&date=${reservation.date}&userId=${reservation.userId}&limit=10`,
      {
        headers: { Authorization: "Bearer test-id-token" },
        signal: undefined,
      },
    );
  });

  it("로그인 상태가 아니면 401 결과로 즉시 끝낸다", async () => {
    vi.mocked(getAdminAuthHeader).mockResolvedValue({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAdminReservations({})).resolves.toEqual({
      ok: false,
      message: "관리자 기능을 사용하려면 먼저 로그인해 주세요.",
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("성공 status여도 예약 목록 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        reservations: [{ ...reservation, status: "unknown" }],
        message: "예약 목록을 불러왔습니다.",
      }),
    );

    await expect(fetchAdminReservations({})).resolves.toEqual({
      ok: false,
      message: "관리자 예약 목록 응답 형식이 올바르지 않습니다.",
      status: 200,
    });
  });

  it("fetches a reservation detail from a valid API response", async () => {
    const fetchMock = mockFetch(Response.json({ reservation }));

    await expect(fetchAdminReservation(reservation.id)).resolves.toEqual({
      ok: true,
      reservation,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/reservations/${reservation.id}`,
      {
        headers: { Authorization: "Bearer test-id-token" },
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
      updateAdminReservationStatus(reservation.id, "used"),
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
          Authorization: "Bearer test-id-token",
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
      updateAdminReservationStatus(reservation.id, "cancelled"),
    ).resolves.toEqual({
      ok: false,
      message: "이용 완료 상태의 예약은 취소할 수 없습니다.",
      status: 409,
      reservation: usedReservation,
    });
  });

  it("성공 status여도 상태 변경 응답 형식이 틀리면 성공으로 보지 않는다", async () => {
    mockFetch(
      Response.json({
        status: "used",
        reservation,
        message: "예약이 이용 완료 처리되었습니다.",
      }),
    );

    await expect(
      updateAdminReservationStatus(reservation.id, "used"),
    ).resolves.toEqual({
      ok: false,
      message: "관리자 예약 상태 변경 응답 형식이 올바르지 않습니다.",
      status: 200,
      reservation,
    });
  });

  it("예약 목록 요청 실패는 네트워크 원문을 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("raw network detail")),
    );

    const result = await fetchAdminReservations({});

    expect(result).toEqual({
      ok: false,
      message: "관리자 예약 목록 요청에 실패했습니다. 다시 시도해 주세요.",
    });
    expect(JSON.stringify(result)).not.toContain("raw network detail");
  });

  it("rethrows abort errors so callers can ignore cancelled requests", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(fetchAdminReservation(reservation.id)).rejects.toBe(abortError);
  });
});
