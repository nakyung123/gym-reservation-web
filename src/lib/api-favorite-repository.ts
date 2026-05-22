"use client";
import { getFirebaseClient } from "@/lib/firebase-client";
import type { FavoriteRepository } from "@/lib/favorite-repository";
import {
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

type IdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; message: string };

const emptyFavoriteSnapshot: ReadonlySet<string> = new Set();

let currentFavoriteIds = new Set<string>();
let currentFavoriteSnapshot: ReadonlySet<string> = emptyFavoriteSnapshot;
let currentToggleError: string | null = null;
let currentLoadError: string | null = null;
let lastFetchedUserId: string | null = null;
let authUnsubscribe: (() => void) | null = null;
let mutationVersion = 0;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSet(next: Set<string>) {
  currentFavoriteIds = next;
  currentFavoriteSnapshot = new Set(next);
  notifyListeners();
}

async function getIdToken(authRequiredMessage: string): Promise<IdTokenResult> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return { ok: false, message: authRequiredMessage };
    }
    return { ok: true, idToken: await auth.currentUser.getIdToken() };
  } catch {
    return {
      ok: false,
      message: "로그인 인증 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }
}

async function fetchFavorites(userId: string): Promise<void> {
  const fetchVersion = mutationVersion;

  // toggle이 발생했거나 사용자가 바뀌었으면 이 fetch 결과는 무효.
  function isStale() {
    return lastFetchedUserId !== userId || fetchVersion !== mutationVersion;
  }

  function failLoad(message: string) {
    if (isStale()) return;
    currentLoadError = message;
    notifyListeners();
  }

  const token = await getIdToken(
    "로그인 정보가 없어 즐겨찾기 목록을 불러올 수 없습니다.",
  );
  if (!token.ok) {
    failLoad(token.message);
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/favorites", {
      headers: { Authorization: `Bearer ${token.idToken}` },
    });
  } catch {
    failLoad("즐겨찾기 목록 요청에 실패했습니다. 다시 시도해 주세요.");
    return;
  }

  if (!response.ok) {
    let message = `즐겨찾기 목록을 불러오지 못했습니다. (${response.status})`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {}
    failLoad(message);
    return;
  }

  let data: { gymIds?: unknown };
  try {
    data = (await response.json()) as { gymIds?: unknown };
  } catch {
    failLoad("즐겨찾기 응답 형식이 올바르지 않습니다.");
    return;
  }

  if (!Array.isArray(data.gymIds)) {
    failLoad("즐겨찾기 응답 형식이 올바르지 않습니다.");
    return;
  }

  if (isStale()) return;

  const ids = data.gymIds.filter((id): id is string => typeof id === "string");
  currentLoadError = null;
  setCurrentSet(new Set(ids));
}

function handleAuthChange() {
  const session = getCurrentFirebaseAuthSession();

  if (!session.ok) {
    if (lastFetchedUserId !== null) {
      lastFetchedUserId = null;
      currentLoadError = null;
      setCurrentSet(new Set());
    }
    return;
  }

  if (session.userId === lastFetchedUserId) {
    return;
  }

  lastFetchedUserId = session.userId;
  currentLoadError = null;
  setCurrentSet(new Set());

  void fetchFavorites(session.userId);
}

function ensureAuthSubscription() {
  if (authUnsubscribe) {
    return;
  }
  authUnsubscribe = subscribeFirebaseAuthSession(handleAuthChange);
  handleAuthChange();
}

async function syncToggle(gymId: string, shouldAdd: boolean): Promise<void> {
  const token = await getIdToken(
    "로그인 정보가 없어 즐겨찾기를 변경할 수 없습니다.",
  );
  if (!token.ok) {
    throw new Error(token.message);
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/favorites/${encodeURIComponent(gymId)}`,
      {
        method: shouldAdd ? "PUT" : "DELETE",
        headers: { Authorization: `Bearer ${token.idToken}` },
      },
    );
  } catch {
    throw new Error("즐겨찾기 변경 요청에 실패했습니다. 다시 시도해 주세요.");
  }

  let data: { message?: unknown } = {};
  try {
    data = (await response.json()) as { message?: unknown };
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `즐겨찾기 ${shouldAdd ? "추가" : "삭제"} 요청이 실패했습니다. status=${response.status}`,
    );
  }
}

export const apiFavoriteRepository: FavoriteRepository = {
  getSnapshot() {
    return currentFavoriteSnapshot;
  },

  getServerSnapshot() {
    return emptyFavoriteSnapshot;
  },

  getErrorSnapshot() {
    return currentToggleError;
  },

  getServerErrorSnapshot() {
    return null;
  },

  getLoadErrorSnapshot() {
    return currentLoadError;
  },

  getServerLoadErrorSnapshot() {
    return null;
  },

  toggle(gymId) {
    mutationVersion++;
    const wasFavorite = currentFavoriteIds.has(gymId);
    const optimistic = new Set(currentFavoriteIds);
    if (wasFavorite) {
      optimistic.delete(gymId);
    } else {
      optimistic.add(gymId);
    }
    currentToggleError = null;
    setCurrentSet(optimistic);

    void syncToggle(gymId, !wasFavorite)
      .catch((error: unknown) => {
        currentToggleError =
          error instanceof Error ? error.message : "즐겨찾기 변경에 실패했습니다.";
        const rollback = new Set(currentFavoriteIds);
        if (wasFavorite) {
          rollback.add(gymId);
        } else {
          rollback.delete(gymId);
        }
        setCurrentSet(rollback);
      })
      .finally(() => {
        if (lastFetchedUserId) {
          void fetchFavorites(lastFetchedUserId);
        }
      });
  },

  subscribe(listener) {
    listeners.add(listener);
    ensureAuthSubscription();
    return () => {
      listeners.delete(listener);

      if (listeners.size === 0 && authUnsubscribe) {
        authUnsubscribe();
        authUnsubscribe = null;
        lastFetchedUserId = null;
        currentToggleError = null;
        currentLoadError = null;
        mutationVersion = 0;
        setCurrentSet(new Set());
      }
    };
  },
};
