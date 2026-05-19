import { apiReservationRepository } from "@/lib/api-reservation-repository";
import { mockReservationRepository } from "@/lib/mock-reservation-repository";
import type { ReservationRepository } from "@/lib/reservation-repository";

type ReservationDataBackend = "mock" | "db";

// 옛 변수 이름. 운영에서 살아 있으면 firestore 분기를 다시 부르는 사고가 난다.
// 명시적으로 차단해 SSOT를 보호한다.
const LEGACY_ENV_VAR = "NEXT_PUBLIC_RESERVATION_DATA_SOURCE";
const CURRENT_ENV_VAR = "NEXT_PUBLIC_RESERVATION_DATA_BACKEND";

function getReservationDataBackend(): ReservationDataBackend {
  if (process.env[LEGACY_ENV_VAR] !== undefined) {
    throw new Error(
      `${LEGACY_ENV_VAR}는 더 이상 사용하지 않습니다. ` +
        `${CURRENT_ENV_VAR}=db(또는 mock)로 교체하세요.`,
    );
  }

  const value = process.env[CURRENT_ENV_VAR]?.trim() || "db";

  if (value === "mock" || value === "db") {
    return value;
  }

  throw new Error(
    `${CURRENT_ENV_VAR}는 "mock" 또는 "db"만 사용할 수 있습니다. 받은 값: "${value}"`,
  );
}

function selectReservationRepository(): ReservationRepository {
  const backend = getReservationDataBackend();

  if (backend === "db") {
    return apiReservationRepository;
  }

  return mockReservationRepository;
}

export const reservationRepository = selectReservationRepository();
