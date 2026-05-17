import "server-only";
import type { Prisma, UserProfile as UserProfileRow } from "@prisma/client";
import { isSport } from "@/lib/domain-constants";
import type { UserProfile, UserProfileInput } from "@/lib/user-profile";
import type { Sport } from "@/types/domain";
import { prisma } from "@/lib/server/prisma-client";
import type { ProviderId } from "@/lib/server/auth-provider";

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

function normalizeProvider(value: string | null): UserProfile["provider"] {
  if (
    value === "local" ||
    value === "google" ||
    value === "kakao" ||
    value === "naver"
  ) {
    return value;
  }
  return null;
}

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.userId,
    nickname: row.nickname,
    provider: normalizeProvider(row.provider),
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

// provider는 클라이언트가 보내지 않고 서버가 산출한 값으로 갱신한다.
// 이미 저장된 provider 값과 다르면 덮어쓴다 (예: 사용자가 동일 이메일에 다른 방식
// 로그인을 시도해 sign_in_provider가 바뀌는 경우 등은 sign-in 자체가 막혀
// 도달할 가능성이 낮지만 정합성을 위해 명시 갱신).
export async function upsertUserProfile(
  userId: string,
  input: UserProfileInput,
  provider: ProviderId | null,
): Promise<UserProfile> {
  const data = toUserProfileData(input);
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, provider, ...data },
    update: { ...data, provider },
  });

  return toUserProfile(row);
}

// 프로필을 보장: 없으면 빈 기본값 + 산출된 provider로 새로 만든다.
// 있으면 provider만 최신 산출값으로 동기화한다 (다른 필드는 건드리지 않는다).
export async function ensureUserProfile(
  userId: string,
  provider: ProviderId | null,
): Promise<UserProfile> {
  const row = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      provider,
      nickname: null,
      preferredRegion: null,
      preferredSports: [],
      reservationNotificationsEnabled: true,
    },
    update: { provider },
  });
  return toUserProfile(row);
}
