import { apiFavoriteRepository } from "@/lib/api-favorite-repository";
import { localStorageFavoriteRepository } from "@/lib/local-storage-favorite-repository";
import type { FavoriteRepository } from "@/lib/favorite-repository";

type FavoriteDataBackend = "db" | "local";

// 옛 변수 이름. 운영에서 살아 있으면 의도하지 않은 분기를 다시 부르는 사고가 난다.
// 명시적으로 차단해 SSOT를 보호한다.
const LEGACY_ENV_VAR = "NEXT_PUBLIC_FAVORITE_DATA_SOURCE";
const CURRENT_ENV_VAR = "NEXT_PUBLIC_FAVORITE_DATA_BACKEND";

function getFavoriteDataBackend(): FavoriteDataBackend {
  if (process.env[LEGACY_ENV_VAR] !== undefined) {
    throw new Error(
      `${LEGACY_ENV_VAR}는 더 이상 사용하지 않습니다. ` +
        `${CURRENT_ENV_VAR}=db(또는 local)로 교체하세요.`,
    );
  }

  const value = process.env[CURRENT_ENV_VAR]?.trim() || "db";

  if (value === "db" || value === "local") {
    return value;
  }

  throw new Error(
    `${CURRENT_ENV_VAR}는 "db" 또는 "local"만 사용할 수 있습니다. 받은 값: "${value}"`,
  );
}

export function getFavoriteRepository(): FavoriteRepository {
  return getFavoriteDataBackend() === "db"
    ? apiFavoriteRepository
    : localStorageFavoriteRepository;
}
