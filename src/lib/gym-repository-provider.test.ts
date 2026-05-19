import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithBackend(backend: string) {
  vi.stubEnv("NEXT_PUBLIC_GYM_DATA_BACKEND", backend);
  const { mockGymRepository } = await import("@/lib/gym-repository");
  const { dbGymRepository } = await import("@/lib/db-gym-repository");
  const { gymRepository } = await import("@/lib/gym-repository-provider");

  return {
    gymRepository,
    mockGymRepository,
    dbGymRepository,
  };
}

describe("gymRepository provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the DB repository when the backend is blank", async () => {
    const { gymRepository, dbGymRepository } =
      await loadProviderWithBackend(" ");

    expect(gymRepository).toBe(dbGymRepository);
  });

  it("selects the DB repository when configured", async () => {
    const { gymRepository, dbGymRepository } =
      await loadProviderWithBackend(" db ");

    expect(gymRepository).toBe(dbGymRepository);
  });

  it("selects the mock repository when configured", async () => {
    const { gymRepository, mockGymRepository } =
      await loadProviderWithBackend("mock");

    expect(gymRepository).toBe(mockGymRepository);
  });

  it("throws instead of silently falling back for an unknown backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_GYM_DATA_BACKEND", "postgres");

    await expect(import("@/lib/gym-repository-provider")).rejects.toThrow(
      "NEXT_PUBLIC_GYM_DATA_BACKEND",
    );
  });

  it("throws when the legacy NEXT_PUBLIC_GYM_DATA_SOURCE is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_GYM_DATA_SOURCE", "mysql");

    await expect(import("@/lib/gym-repository-provider")).rejects.toThrow(
      "NEXT_PUBLIC_GYM_DATA_SOURCE",
    );
  });

  it("throws when the legacy variable is set to firestore", async () => {
    vi.stubEnv("NEXT_PUBLIC_GYM_DATA_SOURCE", "firestore");

    await expect(import("@/lib/gym-repository-provider")).rejects.toThrow(
      "NEXT_PUBLIC_GYM_DATA_SOURCE",
    );
  });
});
