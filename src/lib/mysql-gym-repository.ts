import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import type { GymRepository } from "@/lib/gym-repository";
import { toDomainGym } from "@/lib/server/mysql-gym-mapper";

export const mysqlGymRepository: GymRepository = {
  async list() {
    const rows = await prisma.gym.findMany({
      where: { isActive: true },
      include: { sports: true },
      orderBy: [{ distanceKm: "asc" }, { name: "asc" }],
    });
    return rows.map(toDomainGym);
  },
  async findById(gymId) {
    const row = await prisma.gym.findFirst({
      where: { id: gymId, isActive: true },
      include: { sports: true },
    });
    return row ? toDomainGym(row) : null;
  },
};
