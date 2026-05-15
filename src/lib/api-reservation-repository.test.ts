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
      message: expect.stringContaining("token unavailable"),
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
        message: expect.stringContaining("token unavailable"),
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();

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
      message: expect.stringContaining("network down"),
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
      message: expect.stringContaining("token unavailable"),
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
});
