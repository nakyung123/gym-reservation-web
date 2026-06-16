import "server-only";
import { getAdminReservationOverview } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import {
  buildDailyReportText,
  kstTodayDateString,
  kstYesterdayUtcRange,
  type DailyReportData,
} from "@/lib/server/daily-report-format";

// 일일 운영 리포트의 데이터 수집(집계) 계층. 순수 포맷/타임존 로직은 daily-report-format.ts에 있다.
// 집계 SSOT는 DB(prisma)이며 별도 캐시를 두지 않는다.
//
// 멱등성: "어제" 지표는 createdAt(생성 시점) UTC 반열린 구간으로만 거르고 current status로는
// 거르지 않는다. 그래서 어제 만들고 오늘 취소된 예약(status 변경)은 어제 카운트에 그대로 남아
// 재실행에 안정적이다. 단 회원 탈퇴는 Reservation/Favorite/UserProfile 행을 hard delete하고
// (withdrawal-service.ts), 즐겨찾기 해제도 Favorite 행을 지우므로, 어제 활동한 사용자가 오늘
// 탈퇴/해제하면 재실행 시 해당 카운트가 줄 수 있다(저위험: 운영은 1일 1회, 게시 메시지는 그
// 시점 스냅샷). WithdrawalReason만 append-only(userId 미보관)라 완전 안정.
// "오늘 일정"은 시점 이벤트가 아니라 현재 활성 스냅샷이라 status=reserved 필터가 의도된 정의다.

export async function collectDailyReport(
  { now = new Date() }: { now?: Date } = {},
): Promise<DailyReportData> {
  const { startUtc, endUtc, dateLabel } = kstYesterdayUtcRange(now);
  const todayKstDate = kstTodayDateString(now);
  const createdYesterday = { gte: startUtc, lt: endUtc };

  const [reservationAgg, newSignups, newFavorites, withdrawals, todayOverview] =
    await Promise.all([
      prisma.reservation.aggregate({
        where: { createdAt: createdYesterday },
        _count: { _all: true },
        _sum: { price: true },
      }),
      prisma.userProfile.count({ where: { createdAt: createdYesterday } }),
      prisma.favorite.count({ where: { createdAt: createdYesterday } }),
      prisma.withdrawalReason.count({ where: { createdAt: createdYesterday } }),
      getAdminReservationOverview(todayKstDate),
    ]);

  return {
    yesterdayKstDate: dateLabel,
    todayKstDate,
    newReservations: reservationAgg._count._all,
    bookedValueWon: reservationAgg._sum.price ?? 0,
    newSignups,
    newFavorites,
    withdrawals,
    todayReservedCount: todayOverview.reservations.reserved,
  };
}

// 수집 → 메시지 텍스트까지의 조합. route에서 호출한다.
export async function buildDailyReport(
  { now = new Date() }: { now?: Date } = {},
): Promise<{ data: DailyReportData; text: string }> {
  const data = await collectDailyReport({ now });
  return { data, text: buildDailyReportText(data) };
}
