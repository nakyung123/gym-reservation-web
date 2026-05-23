import "server-only";

export function serverErrorResponse(
  userMessage: string,
  logContext: string,
  error: unknown,
): Response {
  void error;
  console.error(logContext);
  return Response.json({ message: userMessage }, { status: 500 });
}
