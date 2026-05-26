import "server-only";

// 관리자 페이지(/admin) 잠금 전용 Basic Auth.
// 관리자 API(/api/admin/*)의 ADMIN_API_TOKEN과는 완전히 분리된 자격이다.
// (ADMIN_API_TOKEN은 src/lib/server/admin-auth.ts에서 그대로 사용한다.)

export type AdminPageAuthResult =
  | { ok: true }
  | { ok: false; status: 401; reason: "missing" | "invalid" }
  | { ok: false; status: 503; reason: "not-configured" };

export function verifyAdminPageBasicAuth(
  authHeader: string | null,
): AdminPageAuthResult {
  const expectedUser = process.env.ADMIN_PAGE_USER?.trim();
  const expectedPassword = process.env.ADMIN_PAGE_PASSWORD?.trim();

  // production/dev 공통 fail-closed: env 미설정이면 admin 페이지를 열지 않는다.
  if (!expectedUser || !expectedPassword) {
    return { ok: false, status: 503, reason: "not-configured" };
  }

  if (!authHeader) {
    return { ok: false, status: 401, reason: "missing" };
  }

  const spaceIndex = authHeader.indexOf(" ");
  if (spaceIndex === -1) {
    return { ok: false, status: 401, reason: "invalid" };
  }

  const scheme = authHeader.slice(0, spaceIndex);
  const encoded = authHeader.slice(spaceIndex + 1).trim();
  if (scheme.toLowerCase() !== "basic" || !encoded) {
    return { ok: false, status: 401, reason: "invalid" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return { ok: false, status: 401, reason: "invalid" };
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return { ok: false, status: 401, reason: "invalid" };
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const userMatch = timingSafeStringEqual(user, expectedUser);
  const passwordMatch = timingSafeStringEqual(password, expectedPassword);

  if (!userMatch || !passwordMatch) {
    return { ok: false, status: 401, reason: "invalid" };
  }

  return { ok: true };
}

// 길이가 다르면 즉시 false. 같은 길이일 때는 모든 문자 비교로 타이밍을 균일하게.
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
