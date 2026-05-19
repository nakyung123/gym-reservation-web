import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma-client";

export async function listFavoriteGymIds(userId: string): Promise<string[]> {
  const rows = await prisma.favorite.findMany({
    where: { userId, gym: { isActive: true } },
    select: { gymId: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => row.gymId);
}

export type AddFavoriteResult = "added" | "already" | "gym-not-found";

// 멱등: 이미 즐겨찾기되어 있으면 "already". 존재하지 않는 gymId면 "gym-not-found".
export async function addFavorite(
  userId: string,
  gymId: string,
): Promise<AddFavoriteResult> {
  const gym = await prisma.gym.findFirst({
    where: { id: gymId, isActive: true },
    select: { id: true },
  });
  if (!gym) return "gym-not-found";

  try {
    await prisma.favorite.create({ data: { userId, gymId } });
    return "added";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return "already";
      if (error.code === "P2003") return "gym-not-found";
    }
    throw error;
  }
}

// 멱등: 없는 행을 삭제하려 해도 무시.
export async function removeFavorite(
  userId: string,
  gymId: string,
): Promise<void> {
  try {
    await prisma.favorite.delete({
      where: { userId_gymId: { userId, gymId } },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return;
    }
    throw error;
  }
}
