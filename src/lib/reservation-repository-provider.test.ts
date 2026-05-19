import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithBackend(backend: string) {
  vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_BACKEND", backend);
  const { apiReservationRepository } = await import(
    "@/lib/api-reservation-repository"
  );
  const { mockReservationRepository } = await import(
    "@/lib/mock-reservation-repository"
  );
  const { reservationRepository } = await import(
    "@/lib/reservation-repository-provider"
  );

  return {
    apiReservationRepository,
    mockReservationRepository,
    reservationRepository,
  };
}

describe("reservationRepository provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the API/DB repository when the backend is blank", async () => {
    const { apiReservationRepository, reservationRepository } =
      await loadProviderWithBackend(" ");

    expect(reservationRepository).toBe(apiReservationRepository);
  });

  it("selects the API/DB repository when configured", async () => {
    const { apiReservationRepository, reservationRepository } =
      await loadProviderWithBackend(" db ");

    expect(reservationRepository).toBe(apiReservationRepository);
  });

  it("selects the mock repository when configured", async () => {
    const { mockReservationRepository, reservationRepository } =
      await loadProviderWithBackend("mock");

    expect(reservationRepository).toBe(mockReservationRepository);
  });

  it("throws instead of silently falling back for an unknown backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_BACKEND", "local");

    await expect(
      import("@/lib/reservation-repository-provider"),
    ).rejects.toThrow("NEXT_PUBLIC_RESERVATION_DATA_BACKEND");
  });

  it("throws when the legacy NEXT_PUBLIC_RESERVATION_DATA_SOURCE is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_SOURCE", "mysql");

    await expect(
      import("@/lib/reservation-repository-provider"),
    ).rejects.toThrow("NEXT_PUBLIC_RESERVATION_DATA_SOURCE");
  });

  it("throws when the legacy variable is set to firestore", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_SOURCE", "firestore");

    await expect(
      import("@/lib/reservation-repository-provider"),
    ).rejects.toThrow("NEXT_PUBLIC_RESERVATION_DATA_SOURCE");
  });
});
