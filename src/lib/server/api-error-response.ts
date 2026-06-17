import "server-only";

export function serverErrorResponse(
  userMessage: string,
  logContext: string,
  error: unknown,
  status = 500,
): Response {
  console.error(logContext, toSafeErrorLogDetail(error));
  return Response.json({ message: userMessage }, { status });
}

type SafeErrorLogDetail = {
  errorType: string;
  name?: string;
  code?: string;
};

function toSafeErrorLogDetail(error: unknown): SafeErrorLogDetail {
  const detail: SafeErrorLogDetail = { errorType: typeof error };

  if (error instanceof Error) {
    detail.errorType = "Error";
    detail.name = sanitizeErrorName(error.name);
  }

  const code = sanitizeErrorCode(readStringProperty(error, "code"));
  if (code) {
    detail.code = code;
  }

  return detail;
}

function readStringProperty(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== "string") {
    return null;
  }

  return field;
}

function sanitizeErrorName(name: string): string | undefined {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : undefined;
}

function sanitizeErrorCode(code: string | null): string | undefined {
  if (!code) return undefined;

  // Prisma(P2002), Firebase(auth/...), Node.js(ECONNRESET)처럼 잘 알려진 오류 코드만 기록한다.
  // 원문 message/stack 및 임의 문자열은 비밀값일 수 있으므로 남기지 않는다.
  if (/^P\d{4}$/.test(code)) return code;
  if (/^auth\/[a-z0-9-]{1,64}$/.test(code)) return code;
  if (/^E[A-Z0-9_]{2,40}$/.test(code)) return code;
  return undefined;
}
