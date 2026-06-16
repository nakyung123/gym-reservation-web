import "server-only";
import { getAdminReservationOverview } from "@/lib/server/db-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { DEMO_RESERVATION_ID_PREFIX } from "@/lib/domain-constants";
import {
  buildDailyReportText,
  kstBaselineUtcRange,
  kstTodayDateString,
  kstYesterdayUtcRange,
  type DailyReportData,
} from "@/lib/server/daily-report-format";
import {
  generateDailyBrief,
  MAX_WITHDRAWAL_REASONS,
  type AiBrief,
  type AiBriefInput,
} from "@/lib/server/ai-brief";

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
//
// 데모/운영 격리: 운영 리포트(이 모듈)는 데모 시드 예약(id prefix demo-rev-)을 제외한다 →
// "운영 리포트=실데이터만". 반대로 admin 매출/정산 화면은 데모를 포함한다(데모 시드의 본래 목적).
// 따라서 운영자가 보는 "오늘 reserved"가 Slack 리포트와 admin 화면에서 다를 수 있다(버그 아닌
// 의도된 분기). 운영 prod엔 데모 행이 없으므로(시드 prod 가드) 이 제외는 prod에서 no-op다.
// 데모 시드는 reservation만 만들므로 signups/favorites/withdrawals 쿼리엔 필터가 불필요하다.
const EXCLUDE_DEMO = {
  id: { not: { startsWith: DEMO_RESERVATION_ID_PREFIX } },
} as const;

export async function collectDailyReport(
  { now = new Date() }: { now?: Date } = {},
): Promise<DailyReportData> {
  const { startUtc, endUtc, dateLabel } = kstYesterdayUtcRange(now);
  const todayKstDate = kstTodayDateString(now);
  const createdYesterday = { gte: startUtc, lt: endUtc };

  const [reservationAgg, newSignups, newFavorites, withdrawals, todayOverview] =
    await Promise.all([
      prisma.reservation.aggregate({
        where: { createdAt: createdYesterday, ...EXCLUDE_DEMO },
        _count: { _all: true },
        _sum: { price: true },
      }),
      prisma.userProfile.count({ where: { createdAt: createdYesterday } }),
      prisma.favorite.count({ where: { createdAt: createdYesterday } }),
      prisma.withdrawalReason.count({ where: { createdAt: createdYesterday } }),
      getAdminReservationOverview(todayKstDate, { excludeDemo: true }),
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

// AI 브리핑(레이어2) 입력 수집: baseline 일평균 + 어제 탈퇴 사유(자유텍스트).
// 숫자 지표는 collectDailyReport가 이미 모은 DailyReportData를 재사용한다(중복 집계 안 함).
//
// 멱등성: baseline/탈퇴 사유 모두 createdAt 구간 집계라 status 변경엔 안정하다. 단 어제 활동한
// 사용자가 오늘 탈퇴하면 hard delete로 baseline의 Reservation/Favorite/UserProfile(=가입) 카운트가
// 줄 수 있다(collectDailyReport 주석과 동일한 저위험 한계). WithdrawalReason은 append-only라 안정.
export async function collectAiBriefInput(
  data: DailyReportData,
  { now = new Date() }: { now?: Date } = {},
): Promise<AiBriefInput> {
  const baseline = kstBaselineUtcRange(now);
  const yesterday = kstYesterdayUtcRange(now);
  const createdInBaseline = { gte: baseline.startUtc, lt: baseline.endUtc };
  const createdYesterday = { gte: yesterday.startUtc, lt: yesterday.endUtc };

  const [
    baseReservations,
    baseSignups,
    baseFavorites,
    baseWithdrawals,
    reasons,
  ] = await Promise.all([
    prisma.reservation.count({
      where: { createdAt: createdInBaseline, ...EXCLUDE_DEMO },
    }),
    prisma.userProfile.count({ where: { createdAt: createdInBaseline } }),
    prisma.favorite.count({ where: { createdAt: createdInBaseline } }),
    prisma.withdrawalReason.count({ where: { createdAt: createdInBaseline } }),
    prisma.withdrawalReason.findMany({
      where: { createdAt: createdYesterday },
      select: { category: true, detail: true },
      orderBy: { createdAt: "asc" },
      take: MAX_WITHDRAWAL_REASONS,
    }),
  ]);

  // 소수 첫째자리까지 반올림한 일평균(메시지 가독성).
  const perDay = (total: number): number =>
    Math.round((total / baseline.days) * 10) / 10;

  return {
    yesterdayKstDate: data.yesterdayKstDate,
    metrics: {
      newReservations: data.newReservations,
      bookedValueWon: data.bookedValueWon,
      newSignups: data.newSignups,
      newFavorites: data.newFavorites,
      withdrawals: data.withdrawals,
    },
    baseline: {
      reservationsPerDay: perDay(baseReservations),
      signupsPerDay: perDay(baseSignups),
      favoritesPerDay: perDay(baseFavorites),
      withdrawalsPerDay: perDay(baseWithdrawals),
    },
    withdrawalReasons: reasons,
  };
}

// 수집 → (레이어2 AI 브리핑 합성) → 메시지 텍스트까지의 조합. route에서 호출한다.
// AI 브리핑은 best-effort다: 입력 수집/생성 어느 단계가 실패해도 숫자 리포트는 그대로 나간다.
export async function buildDailyReport(
  { now = new Date() }: { now?: Date } = {},
): Promise<{ data: DailyReportData; text: string }> {
  const data = await collectDailyReport({ now });

  let aiBrief: AiBrief | null = null;
  try {
    const briefInput = await collectAiBriefInput(data, { now });
    aiBrief = await generateDailyBrief(briefInput);
  } catch (error) {
    console.error(
      "[daily-report] AI 브리핑 단계 실패 — 숫자 리포트로 폴백한다.",
      error,
    );
    aiBrief = null;
  }

  return { data, text: buildDailyReportText(data, aiBrief) };
}
