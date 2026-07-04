import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// 공개 문의 게시판 글별 임시 비밀번호 해시(scrypt, 외부 의존성 없음).
// 저장 형식: scrypt$<saltHex>$<hashHex>. 검증은 timingSafeEqual로 상수시간 비교한다.
// 임시 비밀번호는 숫자 4자리(약함)이지만, 저장 시 평문 노출을 막기 위해 해시로 보관한다.

const KEYLEN = 32;
const SALT_BYTES = 16;

export function hashVocPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyVocPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
