import { apiFavoriteRepository } from "@/lib/api-favorite-repository";
import { localStorageFavoriteRepository } from "@/lib/local-storage-favorite-repository";
import type { FavoriteRepository } from "@/lib/favorite-repository";

type FavoriteDataSource = "local" | "mysql";

function getFavoriteDataSource(): FavoriteDataSource {
  const value =
    process.env.NEXT_PUBLIC_FAVORITE_DATA_SOURCE?.trim() || "local";

  if (value === "local" || value === "mysql") {
    return value;
  }

  throw new Error(
    "NEXT_PUBLIC_FAVORITE_DATA_SOURCE는 local 또는 mysql만 사용할 수 있습니다.",
  );
}

export function getFavoriteRepository(): FavoriteRepository {
  return getFavoriteDataSource() === "mysql"
    ? apiFavoriteRepository
    : localStorageFavoriteRepository;
}
