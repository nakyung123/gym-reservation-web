import { getApps, initializeApp, type FirebaseApp } from "firebase/app";

type FirebaseEnvKey =
  | "NEXT_PUBLIC_FIREBASE_API_KEY"
  | "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  | "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "NEXT_PUBLIC_FIREBASE_APP_ID";

const firebaseEnv: Record<FirebaseEnvKey, string | undefined> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedApp: FirebaseApp | null = null;

function requireFirebaseEnv(key: FirebaseEnvKey): string {
  const value = firebaseEnv[key]?.trim();

  if (!value) {
    throw new Error(`Firebase 환경변수 ${key}가 설정되지 않았습니다.`);
  }

  return value;
}

function getFirebaseConfig() {
  return {
    apiKey: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    ),
    appId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
}

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) {
    return cachedApp;
  }

  const existingApp = getApps()[0];
  cachedApp = existingApp ?? initializeApp(getFirebaseConfig());

  return cachedApp;
}
