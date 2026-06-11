import "server-only";
import { isReservationStatus } from "@/lib/domain-constants";
import {
  UNKNOWN_GYM_NAME,
  type GymRevenueRow,
  type RevenueReservationCounts,
  type RevenueSummary,
} from "@/lib/admin/revenue";
import { prisma } from "@/lib/server/prisma-client";

// 매출/정산 집계의 단일 기준점.
// per-reservation 매출 SSOT는 reservation.price(예약 시점 getGymSportPrice 스냅샷)다.
// expected = status in [reserved, used] 의 합, used = status = used 의 합.
// 취소(cancelled)는 매출에 포함하지 않는다. 단일 날짜 운영 요약(getAdminReservationOverview)과
// 동일한 정의를 기간/시설 축으로 확장한 것이다.

function emptyCounts(): RevenueReservationCounts {
  return { total: 0, reserved: 0, cancelled: 0, used: 0 };
}

type GymAccumulator = {
  counts: RevenueReservationCounts;
  expected: number;
  used: number;
};

export async function getRevenueSummary(input: {
  from: string;
  to: string;
}): Promise<RevenueSummary> {
  const { from, to } = input;

  // date는 VARCHAR(10) "YYYY-MM-DD"라 사전식 비교가 곧 시간순 비교다. gte/lte 모두 inclusive.
  const grouped = await prisma.reservation.groupBy({
    by: ["gymId", "status"],
    where: { date: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { price: true },
  });

  const gymMap = new Map<string, GymAccumulator>();
  const totalCounts = emptyCounts();
  let totalExpected = 0;
  let totalUsed = 0;

  for (const row of grouped) {
    if (!isReservationStatus(row.status)) {
      throw new Error(`알 수 없는 예약 상태입니다: ${row.status}`);
    }

    const count = row._count._all;
    const priceSum = row._sum.price ?? 0;

    const entry = gymMap.get(row.gymId) ?? {
      counts: emptyCounts(),
      expected: 0,
      used: 0,
    };

    entry.counts[row.status] += count;
    entry.counts.total += count;
    totalCounts[row.status] += count;
    totalCounts.total += count;

    if (row.status === "reserved" || row.status === "used") {
      entry.expected += priceSum;
      totalExpected += priceSum;
    }
    if (row.status === "used") {
      entry.used += priceSum;
      totalUsed += priceSum;
    }

    gymMap.set(row.gymId, entry);
  }

  // groupBy는 relation을 포함할 수 없어 시설 이름은 별도 조회로 join한다.
  const gymIds = [...gymMap.keys()];
  const gymRows =
    gymIds.length > 0
      ? await prisma.gym.findMany({
          where: { id: { in: gymIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameMap = new Map(gymRows.map((gym) => [gym.id, gym.name]));

  const gyms: GymRevenueRow[] = [...gymMap.entries()]
    .map(([gymId, entry]) => ({
      gymId,
      gymName: nameMap.get(gymId) ?? UNKNOWN_GYM_NAME,
      counts: entry.counts,
      revenue: { expected: entry.expected, used: entry.used },
    }))
    // 정산 기준(usedRevenue) 내림차순, 동률이면 전망(expected) 내림차순.
    .sort(
      (a, b) =>
        b.revenue.used - a.revenue.used ||
        b.revenue.expected - a.revenue.expected,
    );

  return {
    from,
    to,
    counts: totalCounts,
    revenue: { expected: totalExpected, used: totalUsed },
    gyms,
  };
}
