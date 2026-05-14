import "server-only";
import type { Prisma, UserProfile as UserProfileRow } from "@prisma/client";
import { isSport } from "@/lib/domain-constants";
import type { UserProfile, UserProfileInput } from "@/lib/user-profile";
import type { Sport } from "@/types/domain";
import { prisma } from "@/lib/server/prisma-client";

function parsePreferredSports(value: Prisma.JsonValue): Sport[] {
  if (!Array.isArray(value)) {
    throw new Error("사용자 프로필 선호 종목 형식이 올바르지 않습니다.");
  }

  const sports: Sport[] = [];
  for (const item of value) {
    if (!isSport(item)) {
      throw new Error(`알 수 없는 선호 종목입니다: ${String(item)}`);
    }
    if (!sports.includes(item)) {
      sports.push(item);
    }
  }

  return sports;
}

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.userId,
    nickname: row.nickname,
    preferredRegion: row.preferredRegion,
    preferredSports: parsePreferredSports(row.preferredSports),
    reservationNotificationsEnabled: row.reservationNotificationsEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toUserProfileData(input: UserProfileInput) {
  return {
    nickname: input.nickname,
    preferredRegion: input.preferredRegion,
    preferredSports: input.preferredSports,
    reservationNotificationsEnabled: input.reservationNotificationsEnabled,
  };
}

export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const row = await prisma.userProfile.findUnique({
    where: { userId },
  });

  return row ? toUserProfile(row) : null;
}

export async function upsertUserProfile(
  userId: string,
  input: UserProfileInput,
): Promise<UserProfile> {
  const data = toUserProfileData(input);
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return toUserProfile(row);
}
