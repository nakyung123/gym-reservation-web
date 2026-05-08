import "server-only";
import {
  cert,
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;

function initAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // 옵션 ㄴ: env에 3개 값 직접 주입한 경우.
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // .env에 \n으로 들어온 개행을 실제 개행으로 복원.
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }

  // 옵션 ㄱ: GOOGLE_APPLICATION_CREDENTIALS 경로 또는 ADC.
  return initializeApp({ credential: applicationDefault() });
}

function getAdminApp(): App {
  if (cachedApp) {
    return cachedApp;
  }
  cachedApp = initAdminApp();
  return cachedApp;
}

export function getAdminAuth(): Auth {
  if (cachedAuth) {
    return cachedAuth;
  }
  cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}
