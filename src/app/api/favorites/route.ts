import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { listFavoriteGymIds } from "@/lib/server/mysql-favorite-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const gymIds = await listFavoriteGymIds(auth.uid);
  return Response.json({ gymIds });
}
