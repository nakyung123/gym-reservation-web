import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";

// 익명 자동 sign-in을 제거한 정식 계정 기반 auth session.
// 상태: loading → (ready | signed-out | failed). signed-out은 정상 상태이며
// 로그인이 필요한 페이지는 client-side useRequireAuth로 /login으로 유도한다.

const LOADING_AUTH_SESSION_MESSAGE = "로그인 정보를 확인하고 있습니다.";

export const LOADING_AUTH_SESSION_SNAPSHOT = JSON.stringify({
  status: "loading",
  message: LOADING_AUTH_SESSION_MESSAGE,
});

const SIGNED_OUT_SNAPSHOT = JSON.stringify({ status: "signed-out" });

type FirebaseAuthSessionFailureReason =
  | "not-ready"
  | "signed-out"
  | "auth-unavailable";

export type FirebaseAuthSessionResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: FirebaseAuthSessionFailureReason;
      message: string;
    };

let currentSnapshot = LOADING_AUTH_SESSION_SNAPSHOT;
let authUnsubscribe: (() => void) | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSnapshot(nextSnapshot: string) {
  if (currentSnapshot === nextSnapshot) return;
  currentSnapshot = nextSnapshot;
  notifyListeners();
}

function createReadySnapshot(userId: string) {
  return JSON.stringify({ status: "ready", userId });
}

function createFailedSnapshot(message: string) {
  return JSON.stringify({
    status: "failed",
    reason: "auth-unavailable",
    message,
  });
}

function getAuthFailureMessage() {
  return "Firebase 인증 상태를 확인하지 못했습니다. 다시 시도해 주세요.";
}

function startAuthSession() {
  if (authUnsubscribe) return;

  setCurrentSnapshot(LOADING_AUTH_SESSION_SNAPSHOT);

  try {
    const { auth } = getFirebaseClient();
    authUnsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          setCurrentSnapshot(createReadySnapshot(user.uid));
          return;
        }
        setCurrentSnapshot(SIGNED_OUT_SNAPSHOT);
      },
      () => {
        setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage()));
      },
    );
  } catch {
    setCurrentSnapshot(createFailedSnapshot(getAuthFailureMessage()));
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
      return { ok: true, userId: parsed.userId };
    }

    if (parsed.status === "loading" && typeof parsed.message === "string") {
      return {
        ok: false,
        reason: "not-ready",
        message: parsed.message,
      };
    }

    if (parsed.status === "signed-out") {
      return {
        ok: false,
        reason: "signed-out",
        message: "로그인이 필요합니다.",
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
