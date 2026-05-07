import { gyms } from "@/lib/mock-data";
import type { Gym } from "@/types/domain";

export type GymRepository = {
  list(): Promise<Gym[]>;
  findById(gymId: string): Promise<Gym | null>;
};

export const mockGymRepository: GymRepository = {
  async list() {
    return gyms;
  },
  async findById(gymId) {
    return gyms.find((gym) => gym.id === gymId) ?? null;
  },
};
