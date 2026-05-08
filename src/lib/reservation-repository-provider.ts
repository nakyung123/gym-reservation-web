import { apiReservationRepository } from "@/lib/api-reservation-repository";
import { firebaseReservationRepository } from "@/lib/firebase-reservation-repository";
import type { ReservationRepository } from "@/lib/reservation-repository";

type ReservationDataSource = "firestore" | "mysql";

function getReservationDataSource(): ReservationDataSource {
  const value =
    process.env.NEXT_PUBLIC_RESERVATION_DATA_SOURCE?.trim() || "firestore";

  if (value === "firestore" || value === "mysql") {
    return value;
  }

  throw new Error(
    "NEXT_PUBLIC_RESERVATION_DATA_SOURCE는 firestore 또는 mysql만 사용할 수 있습니다.",
  );
}

function selectReservationRepository(): ReservationRepository {
  return getReservationDataSource() === "mysql"
    ? apiReservationRepository
    : firebaseReservationRepository;
}

export const reservationRepository = selectReservationRepository();
