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
  });

  it("rolls back an optimistic favorite when the toggle request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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
  });

  it("rolls back an optimistic favorite when no user is signed in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getFirebaseClient.mockReturnValue({ auth: { currentUser: null } });

    const repository = await loadRepository();
    repository.toggle("gym-a");

    expect([...repository.getSnapshot()]).toEqual(["gym-a"]);
    await vi.waitFor(() => {
      expect([...repository.getSnapshot()]).toEqual([]);
    });
  });
});
