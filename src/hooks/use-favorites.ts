"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getFavoriteRepository } from "@/lib/favorite-repository-provider";

const favoriteRepository = getFavoriteRepository();

export function useFavorites() {
  const favorites = useSyncExternalStore(
    favoriteRepository.subscribe,
    favoriteRepository.getSnapshot,
    favoriteRepository.getServerSnapshot,
  );

  const toggleFavorite = useCallback((gymId: string) => {
    favoriteRepository.toggle(gymId);
  }, []);

  const isFavorite = useCallback(
    (gymId: string) => favorites.has(gymId),
    [favorites],
  );

  return { favorites, toggleFavorite, isFavorite };
}
