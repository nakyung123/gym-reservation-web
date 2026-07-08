import type { NextRequest } from "next/server";
import { findUserIdByLoginId } from "@/lib/server/db-user-profile-repository";
import { getAdminAuth } from "@/lib/server/firebase-admin";
import { verifyEmailPassword } from "@/lib/server/firebase-password-verify";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";
import { validateLoginId } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

// 아이디(loginId) + 비밀번호 로그인. Firebase는 이메일 기반이라 서버에서 변환·검증한다.
// 흐름(D안, 이메일 노출 0):
//   1. loginId → uid (Postgres)
//   2. uid → email (Admin SDK, 서버 밖으로 절대 반환 안 함)
//   3. Firebase REST signInWithPassword로 비밀번호를 서버에서 검증
//   4. createCustomToken(uid) → { customToken } 반환 → 클라가 signInWithCustomToken
// 보안: 실패 사유는 enumeration 방지를 위해 generic 메시지로 통일하고, per-IP rate limit를 건다.

// 자격증명 오류는 enumeration 방지를 위해 단일 메시지로 통일한다.
const GENERIC_CREDENTIALS_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다.";

export async function POST(request: NextRequest) {
  // per-IP rate limit: brute force / enumeration 방어. 5분 윈도우 20회.
  const ipLimit = await checkRateLimit({
    scope: "login-id:ip",
    identifier: extractClientIp(request.headers),
    limit: 20,
    windowMs: 5 * 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  let body: { loginId?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { message: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const validation = validateLoginId(body.loginId);
  const password = typeof body.password === "string" ? body.password : "";
  // 형식 오류·빈 비밀번호도 generic 401로 통일(존재 여부 비노출).
  if (!validation.ok || password.length === 0) {
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }

  // per-loginId rate limit: IP를 바꿔가며 특정 아이디 하나를 무차별 대입하는 경로를 캡한다
  // (VOC verify의 per-IP + per-대상 이중 제한과 동일 패턴). 정상 사용자는 10회/10분에 걸리지 않는다.
  const targetLimit = await checkRateLimit({
    scope: "login-id:target",
    identifier: validation.value,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!targetLimit.ok) return rateLimitedJsonResponse(targetLimit);

  let uid: string | null;
  try {
    uid = await findUserIdByLoginId(validation.value);
  } catch (error) {
    console.error("[login-id] findUserIdByLoginId failed:", error);
    return Response.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
  if (!uid) {
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }

  // uid → email. 서버에서만 취득하고 클라이언트로 반환하지 않는다.
  let email: string | undefined;
  try {
    const user = await getAdminAuth().getUser(uid);
    email = user.email ?? undefined;
  } catch {
    // uid는 있는데 Firebase 사용자 조회 실패(삭제 등) → generic.
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }
  if (!email) {
    // 이메일/비밀번호 credential이 없는 계정 → 아이디 로그인 불가.
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }

  // 비밀번호를 서버에서 REST로 검증.
  const verified = await verifyEmailPassword(email, password);
  if (!verified.ok) {
    if (verified.reason === "config") {
      console.error("[login-id] NEXT_PUBLIC_FIREBASE_API_KEY 미설정");
      return Response.json(
        { message: "로그인 설정 오류입니다. 관리자에게 문의해 주세요." },
        { status: 500 },
      );
    }
    if (verified.reason === "network") {
      return Response.json(
        { message: "로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요." },
        { status: 502 },
      );
    }
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }
  // 정합성: REST가 검증한 uid와 loginId가 가리키는 uid가 일치해야 한다.
  if (verified.uid !== uid) {
    return Response.json(
      { message: GENERIC_CREDENTIALS_ERROR },
      { status: 401 },
    );
  }

  // customToken 발급(소셜 흐름과 동일 모델). customToken은 URL/스토리지에 남기지 않고
  // POST response body로만 전달한다. 클라이언트가 signInWithCustomToken으로 세션 수립.
  let customToken: string;
  try {
    customToken = await getAdminAuth().createCustomToken(uid, {
      provider: "login-id",
    });
  } catch {
    console.error("[login-id] createCustomToken failed");
    return Response.json(
      { message: "로그인 토큰 발급에 실패했습니다." },
      { status: 500 },
    );
  }

  return Response.json({ customToken });
}
