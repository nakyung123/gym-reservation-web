import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithSource(source: string) {
  vi.stubEnv("NEXT_PUBLIC_GYM_DATA_SOURCE", source);
  const { mockGymRepository } = await import("@/lib/gym-repository");
  const { firebaseGymRepository } = await import("@/lib/firebase-gym-repository");
  const { mysqlGymRepository } = await import("@/lib/mysql-gym-repository");
  const { gymRepository } = await import("@/lib/gym-repository-provider");

  return {
    firebaseGymRepository,
    gymRepository,
    mockGymRepository,
    mysqlGymRepository,
  };
}

describe("gymRepository provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the MySQL repository when the source is blank", async () => {
    const { gymRepository, mysqlGymRepository } =
      await loadProviderWithSource(" ");

    expect(gymRepository).toBe(mysqlGymRepository);
  });

  it("selects the Firebase repository when configured", async () => {
    const { firebaseGymRepository, gymRepository } =
      await loadProviderWithSource(" firestore ");

    expect(gymRepository).toBe(firebaseGymRepository);
  });

  it("selects the mock repository when configured", async () => {
    const { gymRepository, mockGymRepository } =
      await loadProviderWithSource("mock");

    expect(gymRepository).toBe(mockGymRepository);
  });

  it("throws instead of silently falling back for an unknown source", async () => {
    vi.stubEnv("NEXT_PUBLIC_GYM_DATA_SOURCE", "postgres");

    await expect(import("@/lib/gym-repository-provider")).rejects.toThrow(
      "NEXT_PUBLIC_GYM_DATA_SOURCE",
    );
  });
});
