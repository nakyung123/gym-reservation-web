import type { FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebase-app";

type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
};

let cachedClient: FirebaseClient | null = null;

export function getFirebaseClient(): FirebaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const app = getFirebaseApp();

  cachedClient = {
    app,
    auth: getAuth(app),
  };

  return cachedClient;
}
