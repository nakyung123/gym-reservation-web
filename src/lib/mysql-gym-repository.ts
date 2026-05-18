import "server-only";
import { prisma } from "@/lib/server/prisma-client";
import type { GymRepository } from "@/lib/gym-repository";
import { toDomainGym } from "@/lib/server/mysql-gym-mapper";

export const mysqlGymRepository: GymRepository = {
  async list() {
    // 거리순 정렬은 사용자 현재 위치를 알아야 하므로 클라이언트에서 수행한다 (gym-discovery).
    // 서버 측 기본 정렬은 이름순으로 둔다.
    const rows = await prisma.gym.findMany({
      where: { isActive: true },
      include: { sports: true },
      orderBy: [{ name: "asc" }],
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
