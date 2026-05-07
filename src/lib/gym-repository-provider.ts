import { firebaseGymRepository } from "@/lib/firebase-gym-repository";
import { mockGymRepository, type GymRepository } from "@/lib/gym-repository";

type GymDataSource = "mock" | "firestore";

function getGymDataSource(): GymDataSource {
  const value = process.env.NEXT_PUBLIC_GYM_DATA_SOURCE?.trim() || "mock";

  if (value === "mock" || value === "firestore") {
    return value;
  }

  throw new Error(
    "NEXT_PUBLIC_GYM_DATA_SOURCE는 mock 또는 firestore만 사용할 수 있습니다.",
  );
}

function selectGymRepository(): GymRepository {
  const source = getGymDataSource();

  if (source === "firestore") {
    return firebaseGymRepository;
  }

  return mockGymRepository;
}

export const gymRepository = selectGymRepository();
