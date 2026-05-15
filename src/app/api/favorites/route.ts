import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import { listFavoriteGymIds } from "@/lib/server/mysql-favorite-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let gymIds: Awaited<ReturnType<typeof listFavoriteGymIds>>;
  try {
    gymIds = await listFavoriteGymIds(auth.uid);
  } catch (error) {
    return serverErrorResponse(
      "즐겨찾기 목록을 불러오지 못했습니다.",
      "Failed to list favorite gyms",
      error,
    );
  }
  return Response.json({ gymIds });
}
