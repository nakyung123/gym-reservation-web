import { afterEach, describe, expect, it, vi } from "vitest";
import { apiReservationRepository } from "@/lib/api-reservation-repository";
import type { Reservation, ReservationSlotAvailability } from "@/types/domain";

const {
  getFirebaseClient,
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
} = vi.hoisted(() => ({
  getFirebaseClient: vi.fn(),
  getCurrentFirebaseAuthSession: vi.fn<
    () =>
      | { ok: true; userId: string }
      | {
          ok: false;
          reason: "not-ready" | "auth-unavailable";
          message: string;
        }
  >(() => ({
    ok: false,
    reason: "not-ready",
    message: "인증 상태를 확인하는 중입니다.",
  })),
  subscribeFirebaseAuthSession: vi.fn<(listener: () => void) => () => void>(
    () => vi.fn(),
  ),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("@/lib/firebase-auth-session", () => ({
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
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
  paymentMethod: null,
  phone: null,
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function resetRepositoryState() {
  const unsubscribe = apiReservationRepository.subscribe(vi.fn());
  unsubscribe();
}

function waitForAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("apiReservationRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getFirebaseClient.mockReset();
    getCurrentFirebaseAuthSession.mockReset();
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: false,
      reason: "not-ready",
      message: "인증 상태를 확인하는 중입니다.",
    });
    subscribeFirebaseAuthSession.mockReset();
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    resetRepositoryState();
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

  it("returns remote-unavailable when creating cannot read the ID token", async () => {
    mockCurrentUserTokenError();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiReservationRepository.create(reservation),
    ).resolves.toMatchObject({
      ok: false,
      status: "failed",
      reason: "remote-unavailable",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets a remote-unavailable snapshot when a reservation list token read fails", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: reservation.userId,
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUserTokenError();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toMatchObject({
        ok: false,
        reason: "remote-unavailable",
        message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("uses the server message when a reservation list request fails", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: reservation.userId,
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "예약 목록을 불러오지 못했습니다." },
        { status: 500 },
      ),
    );

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toEqual({
        ok: false,
        reason: "remote-unavailable",
        message: "예약 목록을 불러오지 못했습니다.",
      });
    });

    unsubscribe();
  });

  it("maps reservation list auth failures to auth-required", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: reservation.userId,
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "ID 토큰 검증에 실패했습니다." },
        { status: 401 },
      ),
    );

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toEqual({
        ok: false,
        reason: "auth-required",
        message: "ID 토큰 검증에 실패했습니다.",
      });
    });

    unsubscribe();
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
        // repository가 미지정 paymentMethod/phone을 null로 정규화해 전송한다.
        paymentMethod: reservation.paymentMethod ?? null,
        phone: reservation.phone ?? null,
      }),
    });
  });

  it("does not merge mutation responses from a different signed-in user", async () => {
    const foreignReservation = {
      ...reservation,
      id: "foreign-user-reservation",
      userId: "foreign-user",
    };
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "current-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ reservations: [] }))
        .mockResolvedValueOnce(
          Response.json(
            { status: "created", reservation: foreignReservation },
            { status: 201 },
          ),
        ),
    );

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());
    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toEqual({
        ok: true,
        reservations: [],
      });
    });

    await expect(
      apiReservationRepository.create(foreignReservation),
    ).resolves.toEqual({
      ok: true,
      status: "created",
      reservation: foreignReservation,
    });
    expect(apiReservationRepository.read()).toEqual({
      ok: true,
      reservations: [],
    });

    unsubscribe();
  });

  it("ignores stale reservation list responses after switching users", async () => {
    const firstUserReservation = {
      ...reservation,
      id: "first-user-reservation",
      userId: "first-user",
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    const secondUserReservation = {
      ...reservation,
      id: "second-user-reservation",
      userId: "second-user",
      createdAt: "2026-05-02T00:00:00.000Z",
    };
    const firstFetch = createDeferred<Response>();
    const secondFetch = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);
    let syncAuth: () => void = () => undefined;

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "first-user",
    });
    subscribeFirebaseAuthSession.mockImplementation((listener: () => void) => {
      syncAuth = listener;
      return vi.fn();
    });
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "second-user",
    });
    syncAuth();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    secondFetch.resolve(Response.json({ reservations: [secondUserReservation] }));
    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toEqual({
        ok: true,
        reservations: [secondUserReservation],
      });
    });

    firstFetch.resolve(Response.json({ reservations: [firstUserReservation] }));
    await firstFetch.promise;
    await waitForAsyncWork();
    expect(apiReservationRepository.read()).toEqual({
      ok: true,
      reservations: [secondUserReservation],
    });

    unsubscribe();
  });

  it("keeps the auth failure snapshot when a pending list response finishes after auth becomes unavailable", async () => {
    const pendingFetch = createDeferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(pendingFetch.promise);
    let syncAuth: () => void = () => undefined;

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: reservation.userId,
    });
    subscribeFirebaseAuthSession.mockImplementation((listener: () => void) => {
      syncAuth = listener;
      return vi.fn();
    });
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: false,
      reason: "auth-unavailable",
      message: "auth unavailable",
    });
    syncAuth();
    expect(apiReservationRepository.read()).toMatchObject({
      ok: false,
      reason: "auth-required",
      message: "auth unavailable",
    });

    pendingFetch.resolve(Response.json({ reservations: [reservation] }));
    await pendingFetch.promise;
    await waitForAsyncWork();
    expect(apiReservationRepository.read()).toMatchObject({
      ok: false,
      reason: "auth-required",
      message: "auth unavailable",
    });

    unsubscribe();
  });

  it("does not merge cancel responses from a different signed-in user", async () => {
    const foreignCancelled = {
      ...reservation,
      id: "foreign-cancelled-reservation",
      userId: "foreign-user",
      status: "cancelled" as const,
    };
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "current-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ reservations: [] }))
        .mockResolvedValueOnce(
          Response.json({
            status: "cancelled",
            reservation: foreignCancelled,
          }),
        ),
    );

    const unsubscribe = apiReservationRepository.subscribe(vi.fn());
    await vi.waitFor(() => {
      expect(apiReservationRepository.read()).toEqual({
        ok: true,
        reservations: [],
      });
    });

    await expect(
      apiReservationRepository.cancel(foreignCancelled.id),
    ).resolves.toMatchObject({
      ok: true,
      status: "cancelled",
      reservation: foreignCancelled,
      reservations: [],
    });
    expect(apiReservationRepository.read()).toEqual({
      ok: true,
      reservations: [],
    });

    unsubscribe();
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
      message: "예약 요청에 실패했습니다. 다시 시도해 주세요.",
    });
  });

  it("returns remote-unavailable when cancelling cannot read the ID token", async () => {
    mockCurrentUserTokenError();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiReservationRepository.cancel(reservation.id),
    ).resolves.toMatchObject({
      ok: false,
      status: "failed",
      reason: "remote-unavailable",
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("maps missing reservation cancel responses to not-found", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "취소할 예약을 찾을 수 없습니다." },
        { status: 404 },
      ),
    );

    await expect(
      apiReservationRepository.cancel("missing-reservation"),
    ).resolves.toEqual({
      ok: false,
      status: "not-found",
      message: "취소할 예약을 찾을 수 없습니다.",
      reservations: [],
    });
  });

  it("maps not-cancellable cancel responses and keeps the returned reservation", async () => {
    mockCurrentUser();
    const used = { ...reservation, status: "used" as const };
    mockFetch(
      Response.json(
        {
          status: "not-cancellable",
          reservation: used,
          message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
        },
        { status: 409 },
      ),
    );

    await expect(
      apiReservationRepository.cancel(reservation.id),
    ).resolves.toEqual({
      ok: false,
      status: "not-cancellable",
      message: "예약 완료 상태의 예약만 취소할 수 있습니다.",
      reservation: used,
      reservations: [used],
    });
    expect(apiReservationRepository.read()).toEqual({
      ok: true,
      reservations: [used],
    });
  });

  it("maps cancel auth failures to failed auth-required", async () => {
    mockCurrentUser();
    mockFetch(
      Response.json(
        { message: "다른 사용자의 예약은 취소할 수 없습니다." },
        { status: 403 },
      ),
    );

    await expect(
      apiReservationRepository.cancel(reservation.id),
    ).resolves.toEqual({
      ok: false,
      status: "failed",
      message: "다른 사용자의 예약은 취소할 수 없습니다.",
      reason: "auth-required",
    });
  });
});

describe("apiReservationRepository.fetchActiveInScope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetRepositoryState();
  });

  const scope = {
    gymId: reservation.gymId,
    sport: reservation.sport,
    date: reservation.date,
  };

  it("활성 예약만 요청하도록 쿼리를 구성하고 결과를 반환한다", async () => {
    mockCurrentUser();
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ reservations: [reservation] }), {
        status: 200,
      }),
    );

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservations).toEqual([reservation]);

    // 전체 목록이 아니라 슬롯 범위만 요청해야 한다.
    const url = new URL(
      String(fetchMock.mock.calls[0]?.[0]),
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/reservations");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "reserved",
      gymId: scope.gymId,
      sport: scope.sport,
      date: scope.date,
    });
  });

  it("로그인 정보가 없으면 auth-required로 응답한다", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });
    const fetchMock = mockFetch(new Response("{}", { status: 200 }));

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("auth-required");
    // 토큰이 없으면 서버를 부르지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 응답은 auth-required로 변환한다", async () => {
    mockCurrentUser();
    mockFetch(
      new Response(JSON.stringify({ message: "만료된 토큰" }), { status: 401 }),
    );

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("auth-required");
  });

  it("응답 형식이 예약 배열이 아니면 invalid-storage-data로 응답한다", async () => {
    mockCurrentUser();
    mockFetch(
      new Response(JSON.stringify({ reservations: [{ id: 1 }] }), {
        status: 200,
      }),
    );

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-storage-data");
  });

  it("요청이 취소되면 실패로 보고하지 않는다", async () => {
    mockCurrentUser();
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    // 다른 날짜/종목으로 이동해 취소된 경우다. 화면에 오류를 띄우면 안 된다.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservations).toEqual([]);
  });

  it("토큰 조회 자체가 실패하면 remote-unavailable로 응답한다", async () => {
    mockCurrentUserTokenError();
    const fetchMock = mockFetch(new Response("{}", { status: 200 }));

    const result = await apiReservationRepository.fetchActiveInScope(scope);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("remote-unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
