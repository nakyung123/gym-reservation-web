import type { NextRequest } from "next/server";
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
  const result = await addFavorite(auth.uid, gymId);
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
  await removeFavorite(auth.uid, gymId);
  return Response.json({ ok: true });
}
