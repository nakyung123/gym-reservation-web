"use client";

export type EmailAvailabilityResult =
  | { ok: true; available: true }
  | { ok: true; available: false; reason: "taken" | "invalid" }
  | { ok: false; message: string };

// 이메일 사용 가능 여부 조회. 가입 폼에서 호출하며 인증이 없어도 동작한다.
export async function checkEmailAvailability(
  email: string,
  signal?: AbortSignal,
): Promise<EmailAvailabilityResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: true, available: false, reason: "invalid" };
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/auth/email-availability?email=${encodeURIComponent(trimmed)}`,
      { signal },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return { ok: false, message: "이메일 조회 요청에 실패했습니다." };
  }

  const body = (await response.json().catch(() => null)) as
    | { available?: boolean; reason?: string; message?: unknown }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof body?.message === "string"
          ? body.message
          : `이메일 조회 실패 (status=${response.status})`,
    };
  }

  if (body?.available === true) return { ok: true, available: true };
  if (body?.available === false) {
    const reason = body.reason === "invalid" ? "invalid" : "taken";
    return { ok: true, available: false, reason };
  }
  return { ok: false, message: "이메일 조회 응답이 올바르지 않습니다." };
}
