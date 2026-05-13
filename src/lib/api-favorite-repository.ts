"use client";
import { getFirebaseClient } from "@/lib/firebase-client";
import type { FavoriteRepository } from "@/lib/favorite-repository";
import {
  getCurrentFirebaseAuthSession,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

const emptyFavoriteSnapshot: ReadonlySet<string> = new Set();

let currentFavoriteIds = new Set<string>();
let currentFavoriteSnapshot: ReadonlySet<string> = emptyFavoriteSnapshot;
let lastFetchedUserId: string | null = null;
let authUnsubscribe: (() => void) | null = null;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setCurrentSet(next: Set<string>) {
  currentFavoriteIds = next;
  currentFavoriteSnapshot = new Set(next);
  notifyListeners();
}

async function getIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClient();
    if (!auth.currentUser) {
      return null;
    }
    return await auth.currentUser.getIdToken();
  } catch (error) {
    console.error("ID 토큰을 가져오지 못했습니다.", error);
    return null;
  }
}

async function fetchFavorites(userId: string): Promise<void> {
  const idToken = await getIdToken();
  if (!idToken) {
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/favorites", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (error) {
    console.error("즐겨찾기 목록 요청에 실패했습니다.", error);
    return;
  }

  if (!response.ok) {
    console.error(
      `즐겨찾기 목록을 불러오지 못했습니다. status=${response.status}`,
    );
    return;
  }

  const data = (await response.json()) as { gymIds?: unknown };
  if (!Array.isArray(data.gymIds)) {
    console.error("즐겨찾기 응답 형식이 올바르지 않습니다.");
    return;
  }

  // fetch 도중 사용자가 바뀌었으면 결과 무시.
  if (lastFetchedUserId !== userId) {
    return;
  }

  const ids = data.gymIds.filter((id): id is string => typeof id === "string");
  setCurrentSet(new Set(ids));
}

function handleAuthChange() {
  const session = getCurrentFirebaseAuthSession();

  if (!session.ok) {
    if (lastFetchedUserId !== null) {
      lastFetchedUserId = null;
      setCurrentSet(new Set());
    }
    return;
  }

  if (session.userId === lastFetchedUserId) {
    return;
  }

  lastFetchedUserId = session.userId;
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
  const idToken = await getIdToken();
  if (!idToken) {
    throw new Error("로그인 정보가 없어 즐겨찾기를 변경할 수 없습니다.");
  }

  const response = await fetch(
    `/api/favorites/${encodeURIComponent(gymId)}`,
    {
      method: shouldAdd ? "PUT" : "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `즐겨찾기 ${shouldAdd ? "추가" : "삭제"} 요청이 실패했습니다. status=${response.status}`,
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

  toggle(gymId) {
    const wasFavorite = currentFavoriteIds.has(gymId);
    const optimistic = new Set(currentFavoriteIds);
    if (wasFavorite) {
      optimistic.delete(gymId);
    } else {
      optimistic.add(gymId);
    }
    setCurrentSet(optimistic);

    syncToggle(gymId, !wasFavorite).catch((error) => {
      console.error(error);
      const rollback = new Set(currentFavoriteIds);
      if (wasFavorite) {
        rollback.add(gymId);
      } else {
        rollback.delete(gymId);
      }
      setCurrentSet(rollback);
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
        setCurrentSet(new Set());
      }
    };
  },
};
