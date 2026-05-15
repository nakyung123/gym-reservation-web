import type { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  addFavorite,
  removeFavorite,
} from "@/lib/server/mysql-favorite-repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ gymId: string }> };

export async function PUT(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { gymId } = await ctx.params;
  let result: Awaited<ReturnType<typeof addFavorite>>;
  try {
    result = await addFavorite(auth.uid, gymId);
  } catch (error) {
    return serverErrorResponse(
      "즐겨찾기를 추가하지 못했습니다.",
      "Failed to add favorite gym",
      error,
    );
  }
  if (result === "gym-not-found") {
    return Response.json(
      { message: "존재하지 않는 체육관입니다." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { gymId } = await ctx.params;
  try {
    await removeFavorite(auth.uid, gymId);
  } catch (error) {
    return serverErrorResponse(
      "즐겨찾기를 해제하지 못했습니다.",
      "Failed to remove favorite gym",
      error,
    );
  }
  return Response.json({ ok: true });
}
