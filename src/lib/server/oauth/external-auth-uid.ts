import "server-only";
import { createHash } from "node:crypto";

// 외부 OAuth provider별 Firebase uid 생성 SSOT.
// 형식: "{provider}:{providerUserId}". DB userId 컬럼이 VarChar(64)이므로
// 길이가 64자를 초과하면 SHA-256 hex를 잘라 hash fallback uid로 대체한다.
// 한 번 정해진 매핑은 변하면 안 되므로 호출자는 반드시 이 helper를 사용한다.

export type ExternalAuthProvider = "kakao" | "naver";

const MAX_UID_LENGTH = 64;
const HASH_PREFIX = "h_";

export function buildExternalAuthUid(
  provider: ExternalAuthProvider,
  providerUserId: string | number,
): string {
  const normalizedId = normalizeProviderUserId(providerUserId);
  if (normalizedId.length === 0) {
    throw new Error("buildExternalAuthUid: providerUserId가 비어 있습니다.");
  }

  const prefix = `${provider}:`;
  const directUid = `${prefix}${normalizedId}`;
  if (directUid.length <= MAX_UID_LENGTH) {
    return directUid;
  }

  const hashHex = createHash("sha256").update(normalizedId).digest("hex");
  const maxHashLength = MAX_UID_LENGTH - prefix.length - HASH_PREFIX.length;
  return `${prefix}${HASH_PREFIX}${hashHex.slice(0, maxHashLength)}`;
}

// provider 응답에서 받은 raw id를 항상 string으로 정규화한다.
// JSON 응답의 number가 안전 정수 범위를 벗어나면 호출자가 string으로 받아야 한다.
function normalizeProviderUserId(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        "buildExternalAuthUid: providerUserId number가 안전 정수 범위를 벗어났습니다. 호출자가 string으로 정규화해야 합니다.",
      );
    }
    return String(value);
  }
  return value.trim();
}
