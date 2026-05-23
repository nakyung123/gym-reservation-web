import type { FavoriteRepository } from "@/lib/favorite-repository";

const STORAGE_KEY = "gym-reservation-web:favorites";
const LEGACY_STORAGE_KEY = "gym_favorites";
const emptyFavoriteSnapshot = new Set<string>();

let currentFavoriteIds: string[] | null = null;
let currentFavoriteSnapshot: ReadonlySet<string> = emptyFavoriteSnapshot;
let storageListenerReady = false;

const listeners = new Set<() => void>();

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((id): id is string => typeof id === "string")),
  );
}

function readStoredIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);

    return raw ? normalizeIds(JSON.parse(raw)) : [];
  } catch {
    console.error("즐겨찾기 정보를 불러오지 못했습니다.");
    return [];
  }
}

function writeStoredIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    console.error("즐겨찾기 정보를 저장하지 못했습니다.");
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function replaceFavoriteIds(ids: string[]) {
  currentFavoriteIds = normalizeIds(ids);
  currentFavoriteSnapshot = new Set(currentFavoriteIds);
  notifyListeners();
}

function loadFavoriteIds() {
  if (currentFavoriteIds !== null) {
    return;
  }

  currentFavoriteIds = readStoredIds();
  currentFavoriteSnapshot = new Set(currentFavoriteIds);
}

function listenStorageChange(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) {
    return;
  }

  replaceFavoriteIds(readStoredIds());
}

function ensureStorageListener() {
  if (storageListenerReady || typeof window === "undefined") {
    return;
  }

  window.addEventListener("storage", listenStorageChange);
  storageListenerReady = true;
}

export const localStorageFavoriteRepository: FavoriteRepository = {
  getSnapshot() {
    loadFavoriteIds();
    return currentFavoriteSnapshot;
  },

  getServerSnapshot() {
    return emptyFavoriteSnapshot;
  },

  getErrorSnapshot() {
    return null;
  },

  getServerErrorSnapshot() {
    return null;
  },

  getLoadErrorSnapshot() {
    return null;
  },

  getServerLoadErrorSnapshot() {
    return null;
  },

  toggle(gymId) {
    loadFavoriteIds();

    const current = new Set(currentFavoriteIds ?? []);

    if (current.has(gymId)) {
      current.delete(gymId);
    } else {
      current.add(gymId);
    }

    const next = Array.from(current);
    writeStoredIds(next);
    replaceFavoriteIds(next);
  },

  subscribe(listener) {
    loadFavoriteIds();
    ensureStorageListener();
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
};
