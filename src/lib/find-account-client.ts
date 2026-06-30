"use client";

export type LoginIdByResetCodeResult =
  | { ok: true; loginId: string | null }
  | { ok: false; message: string };

// 비밀번호 재설정 oobCode로 본인 확인된 계정의 가입 아이디(loginId)를 조회한다.
// 이메일을 보내지 않는다 — 서버가 oobCode를 직접 검증해 타인 아이디 조회/열거를 차단한다.
// oobCode는 민감값이라 URL 쿼리가 아니라 POST 본문으로 보낸다(접근 로그 노출 최소화).
export async function fetchLoginIdByResetCode(
  oobCode: string,
): Promise<LoginIdByResetCodeResult> {
  const trimmed = oobCode.trim();
  if (!trimmed) {
    return { ok: true, loginId: null };
  }

  let response: Response;
  try {
    response = await fetch("/api/auth/login-id-by-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode: trimmed }),
    });
  } catch {
    return { ok: false, message: "아이디 조회 요청에 실패했습니다." };
  }

  const body = (await response.json().catch(() => null)) as
    | { loginId?: string | null; message?: unknown }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof body?.message === "string"
          ? body.message
          : `아이디 조회 실패 (status=${response.status})`,
    };
  }

  return { ok: true, loginId: body?.loginId ?? null };
}
