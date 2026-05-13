import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithSource(source: string) {
  vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_SOURCE", source);
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

  it("defaults to the API/MySQL repository when the source is blank", async () => {
    const { apiFavoriteRepository, getFavoriteRepository } =
      await loadProviderWithSource(" ");

    expect(getFavoriteRepository()).toBe(apiFavoriteRepository);
  });

  it("selects the localStorage repository when configured", async () => {
    const { getFavoriteRepository, localStorageFavoriteRepository } =
      await loadProviderWithSource(" local ");

    expect(getFavoriteRepository()).toBe(localStorageFavoriteRepository);
  });

  it("throws instead of silently falling back for an unknown source", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAVORITE_DATA_SOURCE", "firestore");
    const { getFavoriteRepository } = await import(
      "@/lib/favorite-repository-provider"
    );

    expect(() => getFavoriteRepository()).toThrow(
      "NEXT_PUBLIC_FAVORITE_DATA_SOURCE",
    );
  });
});
