import "server-only";
import { Prisma, type UserProfile as UserProfileRow } from "@prisma/client";
import { isSport } from "@/lib/domain-constants";
import type { UserProfile, UserProfileInput } from "@/lib/user-profile";
import type { Sport } from "@/types/domain";
import { prisma } from "@/lib/server/prisma-client";
import type { ProviderId } from "@/lib/server/auth-provider";
import { generateRandomNickname } from "@/lib/random-nickname";

// nickname unique 충돌 시 재시도 횟수. 처음 5회는 base 조합, 이후는 숫자 suffix 포함.
const MAX_NICKNAME_RETRY = 10;

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
    photoBase64: row.photoBase64,
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

// 프로필을 보장: 없으면 자동 nickname + 산출된 provider로 새로 만든다.
// 있으면 provider만 최신 산출값으로 동기화한다 (다른 필드는 건드리지 않는다).
//
// 자동 nickname은 형용사+명사 조합으로 생성하고, unique 충돌(P2002)이 나면
// MAX_NICKNAME_RETRY 회까지 재시도한다. 후반부에는 숫자 suffix를 붙여 충돌률을 낮춘다.
// 동시 호출로 같은 userId가 만들어지는 race는 P2002 catch 후 findUnique로 회수한다.
export async function ensureUserProfile(
  userId: string,
  provider: ProviderId | null,
): Promise<UserProfile> {
  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  if (existing) {
    if (existing.provider === provider) {
      return toUserProfile(existing);
    }
    const updated = await prisma.userProfile.update({
      where: { userId },
      data: { provider },
    });
    return toUserProfile(updated);
  }

  for (let attempt = 0; attempt < MAX_NICKNAME_RETRY; attempt += 1) {
    const nickname = generateRandomNickname(attempt >= 5);
    try {
      const created = await prisma.userProfile.create({
        data: {
          userId,
          provider,
          nickname,
          preferredRegion: null,
          preferredSports: [],
          reservationNotificationsEnabled: true,
        },
      });
      return toUserProfile(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // userId 충돌(다른 콜이 먼저 만든 경우)이면 그 row를 그대로 반환.
        const concurrent = await prisma.userProfile.findUnique({
          where: { userId },
        });
        if (concurrent) return toUserProfile(concurrent);
        // nickname 충돌이면 다음 시도로.
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `자동 닉네임 생성에 ${MAX_NICKNAME_RETRY}회 실패했습니다. 잠시 후 다시 시도해 주세요.`,
  );
}

// 프로필 사진만 갱신한다. 사진은 닉네임/지역 등과 분리된 흐름이라 별도 endpoint를 둔다.
// row가 없으면 자동 닉네임으로 새로 만들고 사진을 채운다(에지 케이스).
export async function updateUserProfilePhoto(
  userId: string,
  photoBase64: string | null,
  provider: ProviderId | null,
): Promise<UserProfile> {
  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  if (existing) {
    const updated = await prisma.userProfile.update({
      where: { userId },
      data: { photoBase64 },
    });
    return toUserProfile(updated);
  }
  // 매우 드문 케이스: 사진 업로드가 ensureUserProfile 보다 먼저 도달.
  // ensureUserProfile 로직과 일관되게 자동 닉네임으로 row를 만든 뒤 사진을 같이 넣는다.
  const ensured = await ensureUserProfile(userId, provider);
  const updated = await prisma.userProfile.update({
    where: { userId: ensured.userId },
    data: { photoBase64 },
  });
  return toUserProfile(updated);
}
