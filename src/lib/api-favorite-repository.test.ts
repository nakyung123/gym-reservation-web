import { afterEach, describe, expect, it, vi } from "vitest";

const { getFirebaseClient, getCurrentFirebaseAuthSession, subscribeFirebaseAuthSession } =
  vi.hoisted(() => ({
    getFirebaseClient: vi.fn(),
    getCurrentFirebaseAuthSession: vi.fn(),
    subscribeFirebaseAuthSession: vi.fn(),
  }));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient,
}));

vi.mock("@/lib/firebase-auth-session", () => ({
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
}));

async function loadRepository() {
  vi.resetModules();
  const { apiFavoriteRepository } = await import(
    "@/lib/api-favorite-repository"
  );
  return apiFavoriteRepository;
}

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

describe("apiFavoriteRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getFirebaseClient.mockReset();
    getCurrentFirebaseAuthSession.mockReset();
    subscribeFirebaseAuthSession.mockReset();
  });

  it("loads favorite IDs for the signed-in user", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "favorite-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ gymIds: ["gym-a", 42, "gym-b"] }));
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual(["gym-a", "gym-b"]);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/favorites", {
      headers: { Authorization: "Bearer id-token" },
    });

    unsubscribe();
  });

  it("fetches the next user's favorites even if the previous fetch is still pending", async () => {
    let authListener: (() => void) | null = null;
    let currentSession = {
      ok: true,
      userId: "favorite-user-a",
    };
    let resolveFirstFetch!: (response: Response) => void;
    let resolveSecondFetch!: (response: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirstFetch = resolve;
    });
    const secondFetch = new Promise<Response>((resolve) => {
      resolveSecondFetch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstFetch)
      .mockReturnValueOnce(secondFetch);
    const getAuthListener = () => {
      if (!authListener) {
        throw new Error("auth listener was not registered");
      }
      return authListener;
    };

    getCurrentFirebaseAuthSession.mockImplementation(() => currentSession);
    subscribeFirebaseAuthSession.mockImplementation((listener) => {
      authListener = listener;
      return vi.fn();
    });
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    currentSession = {
      ok: true,
      userId: "favorite-user-b",
    };
    getAuthListener()();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    resolveSecondFetch(Response.json({ gymIds: ["gym-b"] }));
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual(["gym-b"]);
    });

    resolveFirstFetch(Response.json({ gymIds: ["gym-a"] }));
    await Promise.resolve();
    expect([...repository.getSnapshot()]).toEqual(["gym-b"]);

    unsubscribe();
  });

  it("releases the auth subscription when the last listener unsubscribes", async () => {
    const unsubscribeAuth = vi.fn();
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "favorite-cleanup-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(unsubscribeAuth);
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ gymIds: ["gym-a"] })),
    );

    const repository = await loadRepository();
    const unsubscribeFirst = repository.subscribe(vi.fn());
    const unsubscribeSecond = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    });
    expect(subscribeFirebaseAuthSession).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(unsubscribeAuth).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(unsubscribeAuth).toHaveBeenCalledTimes(1);
    expect([...repository.getSnapshot()]).toEqual([]);
  });

  it("keeps an optimistic favorite after a successful toggle request", async () => {
    mockCurrentUser();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));

    const repository = await loadRepository();
    repository.toggle("gym-a");

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    });
    expect(repository.getErrorSnapshot()).toBeNull();
  });

  it("rolls back an optimistic favorite when the toggle request fails", async () => {
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "failed" }, { status: 500 })),
    );

    const repository = await loadRepository();
    repository.toggle("gym-a");

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual([]);
    });
    expect(repository.getErrorSnapshot()).toBe("failed");
  });

  it("rolls back an optimistic favorite when reading the ID token fails", async () => {
    mockCurrentUserTokenError();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    repository.toggle("gym-a");

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual([]);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.getErrorSnapshot()).toContain("token unavailable");
  });

  it("rolls back an optimistic favorite when no user is signed in", async () => {
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });

    const repository = await loadRepository();
    repository.toggle("gym-a");

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual([]);
    });
    expect(repository.getErrorSnapshot()).toBeTruthy();
  });

  it("clears the previous error when a new toggle starts", async () => {
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(Response.json({ message: "failed" }, { status: 500 }))
        .mockResolvedValue(Response.json({ ok: true })),
    );

    const repository = await loadRepository();
    repository.toggle("gym-a");

    await vi.waitFor(() => {
      expect(repository.getErrorSnapshot()).toBeTruthy();
    });

    repository.toggle("gym-a");
    expect(repository.getErrorSnapshot()).toBeNull();
  });

  it("does not overwrite toggle result when a stale initial fetch resolves late", async () => {
    let resolveInitialFetch!: (response: Response) => void;
    const initialFetch = new Promise<Response>((resolve) => {
      resolveInitialFetch = resolve;
    });
    // 1st: initial GET (pending), 2nd: toggle PUT, 3rd+: re-fetch GET
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initialFetch)
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValue(Response.json({ gymIds: ["gym-a"] }));

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "race-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    repository.toggle("gym-a");
    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);

    // 토글 PUT(2번째) + 재조회 GET(3번째)이 모두 호출될 때까지 대기
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    resolveInitialFetch(Response.json({ gymIds: [] }));
    await Promise.resolve();
    await Promise.resolve();

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    expect(repository.getErrorSnapshot()).toBeNull();

    unsubscribe();
  });

  it("includes base favorites from re-fetch after toggle when initial fetch was stale", async () => {
    let resolveInitialFetch!: (response: Response) => void;
    const initialFetch = new Promise<Response>((resolve) => {
      resolveInitialFetch = resolve;
    });
    // 1st: initial GET (pending), 2nd: toggle PUT (success), 3rd: re-fetch GET (has both)
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initialFetch)
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValue(Response.json({ gymIds: ["gym-a", "gym-b"] }));

    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "recon-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // initial GET 대기 중인 상태에서 gym-a 토글
    repository.toggle("gym-a");
    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);

    // 토글 PUT과 재조회 GET이 완료되어 서버 상태가 반영될 때까지 대기
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual(["gym-a", "gym-b"]);
    });

    // 뒤늦게 도착한 초기 GET 응답(빈 목록)이 상태를 덮어쓰지 않아야 함
    resolveInitialFetch(Response.json({ gymIds: [] }));
    await Promise.resolve();
    await Promise.resolve();

    expect([...repository.getSnapshot()]).toEqual(["gym-a", "gym-b"]);
    expect(repository.getErrorSnapshot()).toBeNull();
    expect(repository.getLoadErrorSnapshot()).toBeNull();

    unsubscribe();
  });

  it("exposes a load error when the initial fetch returns a non-2xx status", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "load-error-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ message: "서버 오류" }, { status: 500 }),
      ),
    );

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(repository.getLoadErrorSnapshot()).toBeTruthy();
    });
    expect([...repository.getSnapshot()]).toEqual([]);

    unsubscribe();
  });

  it("exposes a load error when reading the ID token fails during initial load", async () => {
    getCurrentFirebaseAuthSession.mockReturnValue({
      ok: true,
      userId: "token-fail-load-user",
    });
    subscribeFirebaseAuthSession.mockReturnValue(vi.fn());
    mockCurrentUserTokenError("load token expired");
    vi.stubGlobal("fetch", vi.fn());

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(repository.getLoadErrorSnapshot()).toContain("load token expired");
    });

    unsubscribe();
  });

  it("clears the load error when a subsequent fetch succeeds", async () => {
    let authListener: (() => void) | null = null;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "오류" }, { status: 500 }))
      .mockResolvedValue(Response.json({ gymIds: ["gym-a"] }));

    let currentSession = { ok: true as const, userId: "reload-user-first" };
    getCurrentFirebaseAuthSession.mockImplementation(() => currentSession);
    subscribeFirebaseAuthSession.mockImplementation((listener) => {
      authListener = listener;
      return vi.fn();
    });
    mockCurrentUser();
    vi.stubGlobal("fetch", fetchMock);

    const repository = await loadRepository();
    const unsubscribe = repository.subscribe(vi.fn());

    await vi.waitFor(() => {
      expect(repository.getLoadErrorSnapshot()).toBeTruthy();
    });

    currentSession = { ok: true, userId: "reload-user-second" };
    authListener!();

    await vi.waitFor(() => {
      expect(repository.getLoadErrorSnapshot()).toBeNull();
      expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    });

    unsubscribe();
  });
});
