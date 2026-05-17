import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

const LOADING_AUTH_SESSION_MESSAGE = "로그인 정보를 확인하고 있습니다.";

export const LOADING_AUTH_SESSION_SNAPSHOT = JSON.stringify({
  status: "loading",
  message: LOADING_AUTH_SESSION_MESSAGE,
});

type FirebaseAuthSessionFailureReason = "not-ready" | "auth-unavailable";

export type FirebaseAuthSessionResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      reason: FirebaseAuthSessionFailureReason;
      message: string;
    };

let currentSnapshot = LOADING_AUTH_SESSION_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;
let signInPromise: Promise<unknown> | null = null;
// OAuth handover의 signInWithCustomToken은 내부적으로 sign-out → sign-in 두 단계로
// 동작해 잠깐 user=null이 되는 race가 있다. 그 사이 ensureAnonymousSignIn이
// 즉시 트리거되면 새 익명 user가 생성되어 OAuth 결과를 덮어쓴다.
// 짧은 debounce로 user=null 직후 새 user가 들어오면 익명 sign-in을 skip한다.
const ANONYMOUS_SIGNIN_DEBOUNCE_MS = 300;
let anonSignInTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSnapshot(nextSnapshot: string) {
  if (currentSnapshot === nextSnapshot) {
    return;
  }

  currentSnapshot = nextSnapshot;
  notifyListeners();
}

function createReadySnapshot(userId: string) {
  return JSON.stringify({
    status: "ready",
    userId,
  });
}

function createFailedSnapshot(message: string) {
  return JSON.stringify({
    status: "failed",
    reason: "auth-unavailable",
    message,
  });
}

function getAuthFailureMessage(error: unknown) {
  const detail =
    error instanceof Error && error.message ? ` ${error.message}` : "";

  return `Firebase 익명 로그인에 실패했습니다. Authentication의 Anonymous 제공자가 활성화되어 있는지 확인해주세요.${detail}`;
}

function ensureAnonymousSignIn() {
  if (signInPromise) {
    return signInPromise;
  }

  try {
    const { auth } = getFirebaseClient();

    signInPromise = signInAnonymously(auth)
      .catch((error) => {
        setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage(error)));
      })
      .finally(() => {
        signInPromise = null;
      });

    return signInPromise;
  } catch (error) {
    setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage(error)));
    return Promise.resolve();
  }
}

function startAuthSession() {
  if (authUnsubscribe) {
    return;
  }

  setCurrentSnapshot(LOADING_AUTH_SESSION_SNAPSHOT);

  try {
    const { auth } = getFirebaseClient();

    authUnsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          // user가 다시 들어오면 보류 중인 익명 sign-in 취소.
          if (anonSignInTimer) {
            clearTimeout(anonSignInTimer);
            anonSignInTimer = null;
          }
          setCurrentSnapshot(createReadySnapshot(user.uid));
          return;
        }

        if (anonSignInTimer) {
          return;
        }
        anonSignInTimer = setTimeout(() => {
          anonSignInTimer = null;
          void ensureAnonymousSignIn();
        }, ANONYMOUS_SIGNIN_DEBOUNCE_MS);
      },
      (error) => {
        setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage(error)));
      },
    );
  } catch (error) {
    setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage(error)));
  }
}

export function subscribeFirebaseAuthSession(listener: () => void) {
  listeners.add(listener);
  startAuthSession();

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && authUnsubscribe) {
      authUnsubscribe();
      authUnsubscribe = null;
      if (anonSignInTimer) {
        clearTimeout(anonSignInTimer);
        anonSignInTimer = null;
      }
    }
  };
}

export function getFirebaseAuthSessionSnapshot() {
  return currentSnapshot;
}

export function getFirebaseAuthSessionServerSnapshot() {
  return LOADING_AUTH_SESSION_SNAPSHOT;
}

export function parseFirebaseAuthSessionSnapshot(
  snapshot: string,
): FirebaseAuthSessionResult {
  try {
    const parsed = JSON.parse(snapshot) as {
      status?: unknown;
      userId?: unknown;
      reason?: unknown;
      message?: unknown;
    };

    if (parsed.status === "ready" && typeof parsed.userId === "string") {
      return {
        ok: true,
        userId: parsed.userId,
      };
    }

    if (parsed.status === "loading" && typeof parsed.message === "string") {
      return {
        ok: false,
        reason: "not-ready",
        message: parsed.message,
      };
    }

    if (
      parsed.status === "failed" &&
      parsed.reason === "auth-unavailable" &&
      typeof parsed.message === "string"
    ) {
      return {
        ok: false,
        reason: "auth-unavailable",
        message: parsed.message,
      };
    }

    return {
      ok: false,
      reason: "auth-unavailable",
      message: "로그인 상태 형식이 올바르지 않습니다.",
    };
  } catch {
    return {
      ok: false,
      reason: "auth-unavailable",
      message: "로그인 상태를 해석할 수 없습니다.",
    };
  }
}

export function getCurrentFirebaseAuthSession() {
  return parseFirebaseAuthSessionSnapshot(currentSnapshot);
}
