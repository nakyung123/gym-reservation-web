import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { getUserSummary } from "@/lib/server/mysql-user-summary-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const summary = await getUserSummary(auth.uid);
  return Response.json({
    user: { uid: auth.uid },
    summary,
  });
}
