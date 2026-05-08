import { firebaseGymRepository } from "@/lib/firebase-gym-repository";
import { mockGymRepository, type GymRepository } from "@/lib/gym-repository";
import { mysqlGymRepository } from "@/lib/mysql-gym-repository";

type GymDataSource = "mock" | "firestore" | "mysql";

function getGymDataSource(): GymDataSource {
  // 기본은 mysql. mock/firestore는 옵션으로 보존.
  const value = process.env.NEXT_PUBLIC_GYM_DATA_SOURCE?.trim() || "mysql";

  if (value === "mock" || value === "firestore" || value === "mysql") {
    return value;
  }

  throw new Error(
    "NEXT_PUBLIC_GYM_DATA_SOURCE는 mock, firestore, mysql만 사용할 수 있습니다.",
  );
}

function selectGymRepository(): GymRepository {
  const source = getGymDataSource();

  if (source === "firestore") {
    return firebaseGymRepository;
  }

  if (source === "mysql") {
    return mysqlGymRepository;
  }

  return mockGymRepository;
}

export const gymRepository = selectGymRepository();
