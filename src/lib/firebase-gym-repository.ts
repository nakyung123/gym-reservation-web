import {
  collection,
  doc,
  getDoc,
  getDocs,
  type DocumentData,
  type DocumentSnapshot,
  getFirestore,
  type QueryDocumentSnapshot,
  type Firestore,
} from "firebase/firestore/lite";
import { getFirebaseApp } from "@/lib/firebase-app";
import { isSport } from "@/lib/domain-constants";
import type { Gym, Sport } from "@/types/domain";
import type { GymRepository } from "@/lib/gym-repository";

const GYMS_COLLECTION = "gyms";
let cachedGymDb: Firestore | null = null;

function getFirebaseGymDb(): Firestore {
  if (cachedGymDb) {
    return cachedGymDb;
  }

  cachedGymDb = getFirestore(getFirebaseApp());

  return cachedGymDb;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSportArray(value: unknown): value is Sport[] {
  return Array.isArray(value) && value.every(isSport);
}

function parseSportPrices(value: unknown): Partial<Record<Sport, number>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const sportPrices: Partial<Record<Sport, number>> = {};

  for (const [sport, price] of Object.entries(value)) {
    if (!isSport(sport) || typeof price !== "number" || !Number.isFinite(price)) {
      return null;
    }

    sportPrices[sport] = price;
  }

  return sportPrices;
}

function parseGymDocument(
  snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>,
): Gym {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`체육관 문서 ${snapshot.id}의 데이터가 비어 있습니다.`);
  }

  const sportPrices = parseSportPrices(data.sportPrices);

  if (
    data.id !== snapshot.id ||
    typeof data.name !== "string" ||
    typeof data.region !== "string" ||
    typeof data.address !== "string" ||
    typeof data.officialUrl !== "string" ||
    typeof data.openHours !== "string" ||
    typeof data.basePrice !== "number" ||
    !Number.isFinite(data.basePrice) ||
    !isSportArray(data.sports) ||
    !sportPrices ||
    !isStringArray(data.facilities) ||
    !isStringArray(data.availableTimes) ||
    !isStringArray(data.closedDays) ||
    typeof data.distanceKm !== "number" ||
    !Number.isFinite(data.distanceKm) ||
    typeof data.description !== "string"
  ) {
    throw new Error(`체육관 문서 ${snapshot.id}의 형식이 올바르지 않습니다.`);
  }

  return {
    id: data.id,
    name: data.name,
    region: data.region,
    address: data.address,
    officialUrl: data.officialUrl,
    openHours: data.openHours,
    basePrice: data.basePrice,
    sports: data.sports,
    sportPrices,
    facilities: data.facilities,
    availableTimes: data.availableTimes,
    closedDays: data.closedDays,
    distanceKm: data.distanceKm,
    description: data.description,
  };
}

function sortGymsByDistance(gyms: Gym[]) {
  return gyms.toSorted(
    (left, right) =>
      left.distanceKm - right.distanceKm || left.name.localeCompare(right.name),
  );
}

export const firebaseGymRepository: GymRepository = {
  async list() {
    const db = getFirebaseGymDb();
    const gymsSnapshot = await getDocs(collection(db, GYMS_COLLECTION));
    const gyms = gymsSnapshot.docs.map(parseGymDocument);

    return sortGymsByDistance(gyms);
  },
  async findById(gymId) {
    const db = getFirebaseGymDb();
    const gymSnapshot = await getDoc(doc(db, GYMS_COLLECTION, gymId));

    if (!gymSnapshot.exists()) {
      return null;
    }

    return parseGymDocument(gymSnapshot);
  },
};
