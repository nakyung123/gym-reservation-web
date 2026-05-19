import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithBackend(backend: string) {
  vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_BACKEND", backend);
  const { apiFavoriteRepository } = await import("@/lib/api-favorite-repository");
  const { localStorageFavoriteRepository } = await import(
    "@/lib/local-storage-favorite-repository"
  );
  const { getFavoriteRepository } = await import(
    "@/lib/favorite-repository-provider"
  );

  return {
    apiFavoriteRepository,
    getFavoriteRepository,
    localStorageFavoriteRepository,
  };
}

describe("favoriteRepository provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the API/DB repository when the backend is blank", async () => {
    const { apiFavoriteRepository, getFavoriteRepository } =
      await loadProviderWithBackend(" ");

    expect(getFavoriteRepository()).toBe(apiFavoriteRepository);
  });

  it("selects the API/DB repository when configured", async () => {
    const { apiFavoriteRepository, getFavoriteRepository } =
      await loadProviderWithBackend(" db ");

    expect(getFavoriteRepository()).toBe(apiFavoriteRepository);
  });

  it("selects the localStorage repository when configured", async () => {
    const { getFavoriteRepository, localStorageFavoriteRepository } =
      await loadProviderWithBackend(" local ");

    expect(getFavoriteRepository()).toBe(localStorageFavoriteRepository);
  });

  it("throws instead of silently falling back for an unknown backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_BACKEND", "mysql");
    const { getFavoriteRepository } = await import(
      "@/lib/favorite-repository-provider"
    );

    expect(() => getFavoriteRepository()).toThrow(
      "NEXT_PUBLIC_FAVORITE_DATA_BACKEND",
    );
  });

  it("throws when the legacy NEXT_PUBLIC_FAVORITE_DATA_SOURCE is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_SOURCE", "mysql");
    const { getFavoriteRepository } = await import(
      "@/lib/favorite-repository-provider"
    );

    expect(() => getFavoriteRepository()).toThrow(
      "NEXT_PUBLIC_FAVORITE_DATA_SOURCE",
    );
  });

  it("throws when the legacy variable is set to local", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_SOURCE", "local");
    const { getFavoriteRepository } = await import(
      "@/lib/favorite-repository-provider"
    );

    expect(() => getFavoriteRepository()).toThrow(
      "NEXT_PUBLIC_FAVORITE_DATA_SOURCE",
    );
  });
});
