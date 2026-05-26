import type { FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebase-app";

type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
};

let cachedClient: FirebaseClient | null = null;
let appCheckInitialized = false;

// App Check는 부작용으로만 초기화한다. 초기화되면 Firebase SDK가 이후 모든 호출에
// 자동으로 App Check 토큰을 첨부한다. 호출 측은 별도 처리 없이 동일.
//
// 정책:
// - 브라우저 전용. SSR / Node 환경(typeof window === "undefined")에서는 skip.
// - NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY 부재 시 skip (점진 도입 단계 / 테스트 환경).
//   운영 Vercel env에 키가 들어 있으면 자동 작동.
// - 같은 세션에서 한 번만 초기화한다(중복 호출 시 Firebase가 throw).
// - 초기화 실패는 warn으로 알리고 throw하지 않는다. App Check가 작동하지 않을 뿐
//   기존 Firebase Auth 흐름은 그대로 유지(점진 도입 안전성).
//   ENFORCE 모드로 전환되면 토큰 없는 호출은 Firebase 측에서 차단된다.
function maybeInitializeAppCheck(app: FirebaseApp): void {
  if (appCheckInitialized) return;
  if (typeof window === "undefined") return;

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY?.trim();
  if (!siteKey) return;

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    console.warn("[app-check] initialization failed", error);
  }
}

export function getFirebaseClient(): FirebaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const app = getFirebaseApp();
  maybeInitializeAppCheck(app);

  cachedClient = {
    app,
    auth: getAuth(app),
  };

  return cachedClient;
}
