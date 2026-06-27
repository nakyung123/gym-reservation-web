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
    loginId: row.loginId,
    provider: normalizeProvider(row.provider),
    name: row.name,
    phone: row.phone,
    birthDate: row.birthDate,
    address: row.address,
    preferredRegion: row.preferredRegion,
    preferredSports: parsePreferredSports(row.preferredSports),
    reservationNotificationsEnabled: row.reservationNotificationsEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// 저장 대상은 회원정보변경에서 편집 가능한 필드만. nickname/preferredRegion/
// preferredSports는 여기서 건드리지 않아 기존 값이 보존된다.
function toUserProfileData(input: UserProfileInput) {
  return {
    name: input.name,
    phone: input.phone,
    birthDate: input.birthDate,
    address: input.address,
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

// 아이디(loginId)로 소유자 uid를 찾는다. 중복확인 API와 아이디 로그인 변환의 공통 경로.
// 없으면 null. 입력 형식 검증은 호출 측(validateLoginId)이 먼저 수행한다.
export async function findUserIdByLoginId(
  loginId: string,
): Promise<string | null> {
  const row = await prisma.userProfile.findUnique({
    where: { loginId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export type SetLoginIdResult =
  | { ok: true; loginId: string }
  // already-set: 이미 아이디가 설정됨(불변). taken: 다른 회원이 사용 중. no-profile: 프로필 없음.
  | { ok: false; reason: "already-set" | "taken" | "no-profile" };

// 아이디를 1회 설정한다(불변). `loginId IS NULL`인 row만 갱신해 재설정/덮어쓰기를 막는다.
// 다른 회원이 같은 아이디를 선점한 경우 unique 제약 위반(P2002)을 taken으로 변환한다.
export async function setLoginIdOnce(
  userId: string,
  loginId: string,
): Promise<SetLoginIdResult> {
  try {
    const result = await prisma.userProfile.updateMany({
      where: { userId, loginId: null },
      data: { loginId },
    });
    if (result.count === 1) {
      return { ok: true, loginId };
    }
    // count 0: 프로필이 없거나 이미 아이디가 설정된 상태. 구분해서 응답한다.
    const existing = await prisma.userProfile.findUnique({
      where: { userId },
      select: { loginId: true },
    });
    if (!existing) {
      return { ok: false, reason: "no-profile" };
    }
    return { ok: false, reason: "already-set" };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
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
  // provider가 null로 산출되는 경우(예: 아이디 로그인 = custom token, sign_in_provider="custom")
  // 기존에 저장된 provider(local/google 등)를 null로 덮어쓰지 않는다(No Silent Fallback).
  const providerUpdate = provider ? { provider } : {};
  const row = await prisma.userProfile.upsert({
    where: { userId },
    // PUT은 보통 ensureUserProfile로 생성된 row를 update하지만, 방어적으로 create
    // 경로에서도 필수 컬럼(preferredSports)을 기본값으로 채운다. nickname은 nullable.
    create: { userId, provider, preferredSports: [], ...data },
    update: { ...data, ...providerUpdate },
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
    // provider가 null로 산출되면(아이디 로그인 custom token 등) 기존 provider를 보존한다.
    // 알려진 provider를 null로 덮어쓰지 않는다(No Silent Fallback).
    if (provider === null || existing.provider === provider) {
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
