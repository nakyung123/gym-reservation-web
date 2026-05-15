import "server-only";

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "unknown error";
}

export function serverErrorResponse(
  userMessage: string,
  logContext: string,
  error: unknown,
): Response {
  console.error(`${logContext}: ${getErrorMessage(error)}`);
  return Response.json({ message: userMessage }, { status: 500 });
}
