import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProviderWithSource(source: string) {
  vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_SOURCE", source);
  const { apiReservationRepository } = await import(
    "@/lib/api-reservation-repository"
  );
  const { firebaseReservationRepository } = await import(
    "@/lib/firebase-reservation-repository"
  );
  const { reservationRepository } = await import(
    "@/lib/reservation-repository-provider"
  );

  return {
    apiReservationRepository,
    firebaseReservationRepository,
    reservationRepository,
  };
}

describe("reservationRepository provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the API/MySQL repository when the source is blank", async () => {
    const { apiReservationRepository, reservationRepository } =
      await loadProviderWithSource(" ");

    expect(reservationRepository).toBe(apiReservationRepository);
  });

  it("selects the Firebase repository when configured", async () => {
    const { firebaseReservationRepository, reservationRepository } =
      await loadProviderWithSource(" firestore ");

    expect(reservationRepository).toBe(firebaseReservationRepository);
  });

  it("throws instead of silently falling back for an unknown source", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVATION_DATA_SOURCE", "local");

    await expect(
      import("@/lib/reservation-repository-provider"),
    ).rejects.toThrow("NEXT_PUBLIC_RESERVATION_DATA_SOURCE");
  });
});
