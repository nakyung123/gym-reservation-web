import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";

// 외부 OAuth 흐름의 attempt/ticket/state 등에 공통으로 쓰는 opaque token helper.
// state는 DB에 저장된 record와 비교하기만 하면 충분하므로 HMAC을 따로 두지 않는다.
// 24바이트 randomBytes를 base64url 인코딩하면 32자 길이의 URL-safe 토큰이 된다.

const TOKEN_BYTES = 24;

export const OAUTH_ATTEMPT_COOKIE = "oauth_attempt_id";

// handover 단계에서 ticket bearer를 보강하기 위한 HttpOnly nonce cookie.
// callback이 발급한 ticket과 cookie의 nonce가 모두 일치해야 /token이 진행된다.
export const OAUTH_HANDOVER_COOKIE = "oauth_handover_nonce";

export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

// 두 토큰을 길이/내용 모두 timing-safe하게 비교한다.
// 길이가 다르면 즉시 false. Buffer 변환 실패도 false.
export function safeEqualToken(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}
