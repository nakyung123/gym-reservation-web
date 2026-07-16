import "server-only";
import { Prisma, type UserProfile as UserProfileRow } from "@prisma/client";
import type {
  CustomerProfileInfo,
  CustomerProvider,
  CustomerReservationSummary,
  CustomerSummary,
} from "@/lib/admin/customer";
import { prisma } from "@/lib/server/prisma-client";
import { getUserSummary } from "@/lib/server/db-user-summary-repository";

// 관리자 고객 목록/상세의 DB 집계 경계.
// 목록 SSOT는 UserProfile 행이다(프로필이 없는 Firebase 전용 유저는 목록에 안 보일 수 있고,
// 그런 유저는 예약 화면에서 uid로 상세 진입한다). 예약/즐겨찾기 지표는 DB 집계로 채운다.

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function normalizeProvider(value: string | null): CustomerProvider {
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

function parseStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toProfileInfo(row: UserProfileRow): CustomerProfileInfo {
  return {
    name: row.name,
    loginId: row.loginId,
    provider: normalizeProvider(row.provider),
    preferredRegion: row.preferredRegion,
    preferredSports: parseStringArray(row.preferredSports),
    reservationNotificationsEnabled: row.reservationNotificationsEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCustomers(
  input: { q?: string; limit?: number } = {},
): Promise<CustomerSummary[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  const where: Prisma.UserProfileWhereInput = {};
  const q = input.q?.trim();
  if (q) {
    // 이름 또는 로그인 아이디로 검색한다(닉네임은 자동 생성값이라 검색 대상에서 제외).
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { loginId: { contains: q, mode: "insensitive" } },
    ];
  }

  const profiles = await prisma.userProfile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (profiles.length === 0) {
    return [];
  }

  const userIds = profiles.map((profile) => profile.userId);
  const [reservationCounts, favoriteCounts] = await Promise.all([
    // 데모 가드: 예약 count를 조회된 UserProfile의 userId로만 집계한다. 데모 예약은 userId가
    // demo-user-N(프로필 없음)이라 여기엔 자연히 빠진다. 단 향후 user 스코프 없이(날짜/전역)
    // 집계하도록 바꾸면 데모 예약(id prefix demo-rev-)이 섞이므로 그땐 demo 제외가 필요하다.
    prisma.reservation.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.favorite.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, gym: { isActive: true } },
      _count: { _all: true },
    }),
  ]);

  const reservationMap = new Map(
    reservationCounts.map((row) => [row.userId, row._count._all]),
  );
  const favoriteMap = new Map(
    favoriteCounts.map((row) => [row.userId, row._count._all]),
  );

  return profiles.map((profile) => ({
    userId: profile.userId,
    name: profile.name,
    loginId: profile.loginId,
    provider: normalizeProvider(profile.provider),
    createdAt: profile.createdAt.toISOString(),
    reservationCount: reservationMap.get(profile.userId) ?? 0,
    activeFavoriteCount: favoriteMap.get(profile.userId) ?? 0,
  }));
}

export type CustomerCoreDetail = {
  profile: CustomerProfileInfo | null;
  reservations: CustomerReservationSummary;
  activeFavoriteCount: number;
};

// DB 측 상세(프로필 + 예약 상태 집계 + 활성 즐겨찾기 수).
// 예약/즐겨찾기 집계는 getUserSummary를 그대로 재사용한다(SSOT 중복 방지).
export async function getCustomerCoreDetail(
  userId: string,
): Promise<CustomerCoreDetail> {
  const [summary, profileRow] = await Promise.all([
    getUserSummary(userId),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);

  return {
    profile: profileRow ? toProfileInfo(profileRow) : null,
    reservations: summary.reservations,
    activeFavoriteCount: summary.favorites.activeGymCount,
  };
}
