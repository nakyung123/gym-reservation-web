import { localStorageFavoriteRepository } from "@/lib/local-storage-favorite-repository";
import type { FavoriteRepository } from "@/lib/favorite-repository";

// Firebase 사용자 인증 도입 시 firebase-favorite-repository로 교체
export function getFavoriteRepository(): FavoriteRepository {
  return localStorageFavoriteRepository;
}
