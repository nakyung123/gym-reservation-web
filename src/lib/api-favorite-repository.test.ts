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
