"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminOverview,
  fetchAdminOverviewTrend,
  type AdminReservationOverview,
  type AdminReservationTrendPoint,
} from "@/lib/admin/admin-overview-client";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  AdminButtonSpinner,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { ReservationTrendChart } from "@/components/admin/admin-charts";
import { reservationStatusLabel } from "@/components/reservation-ticket";

type OverviewState =
  | { status: "loading" }
  | { status: "ready"; overview: AdminReservationOverview }
  | { status: "error"; message: string };

type TrendState =
  | { status: "loading" }
  | { status: "ready"; trend: AdminReservationTrendPoint[] }
  | { status: "error"; message: string };

// 추이 차트 범위(선택 날짜 포함 최근 14일).
const TREND_DAYS = 14;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getTodayValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// YYYY-MM-DD 문자열을 UTC 기준으로 delta일 이동한다.
function shiftDate(date: string, delta: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function getSlotUsageLabel(overview: AdminReservationOverview) {
  if (overview.slots.capacity === 0) {
    return "0%";
  }
  return `${Math.round((overview.slots.reservedCount / overview.slots.capacity) * 100)}%`;
}

// 전체 예약이 0이면 분모가 없어 비율 표시가 의미 없으므로 null을 돌려준다.
function getCancellationRateLabel(
  overview: AdminReservationOverview,
): string | null {
  if (overview.reservations.total === 0) {
    return null;
  }
  const ratio =
    (overview.reservations.cancelled / overview.reservations.total) * 100;
  return `${ratio.toFixed(1)}%`;
}

export function AdminOverviewPanel() {
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  // 실제 조회에 쓰인 날짜. 진입 시 오늘 날짜로 자동 조회한다.
  const [submittedDate, setSubmittedDate] = useState(selectedDate);
  // 같은 날짜 재조회용 nonce.
  const [reloadKey, setReloadKey] = useState(0);
  const [overviewState, setOverviewState] = useState<OverviewState>({
    status: "loading",
  });
  const [trendState, setTrendState] = useState<TrendState>({
    status: "loading",
  });

  // 요약·추이를 함께 로드한다. effect body에서 곧바로 setState 하지 않도록
  // setTimeout(0)로 미룬다(다른 admin view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setOverviewState({ status: "loading" });
        setTrendState({ status: "loading" });

        const trendFrom = shiftDate(submittedDate, -(TREND_DAYS - 1));
        try {
          const [overviewResult, trendResult] = await Promise.all([
            fetchAdminOverview(submittedDate, controller.signal),
            fetchAdminOverviewTrend(
              trendFrom,
              submittedDate,
              controller.signal,
            ),
          ]);
          if (controller.signal.aborted) return;

          if (overviewResult.ok) {
            setOverviewState({
              status: "ready",
              overview: overviewResult.overview,
            });
          } else {
            setOverviewState({
              status: "error",
              message: overviewResult.message,
            });
          }

          if (trendResult.ok) {
            setTrendState({ status: "ready", trend: trendResult.trend });
          } else {
            setTrendState({ status: "error", message: trendResult.message });
          }
        } catch {
          // AbortError(언마운트/재요청)는 무시한다.
        }
      })();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [submittedDate, reloadKey]);

  const handleQuery = useCallback(() => {
    if (selectedDate === submittedDate) {
      setReloadKey((key) => key + 1);
    } else {
      setSubmittedDate(selectedDate);
    }
  }, [selectedDate, submittedDate]);

  const overview =
    overviewState.status === "ready" ? overviewState.overview : null;
  const trend = trendState.status === "ready" ? trendState.trend : null;
  const isLoading = overviewState.status === "loading";

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950">운영 요약</h2>
          <p className="mt-1 text-xs text-slate-500">
            날짜별 예약 상태, 예상 매출, 슬롯 현황과 최근 {TREND_DAYS}일 예약
            추이를 확인합니다.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_auto]">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-10 rounded-md border border-line-strong px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="button"
            onClick={handleQuery}
            disabled={isLoading}
            className="h-10 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <AdminButtonSpinner />
                조회 중
              </span>
            ) : (
              "조회"
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <AdminLoadingRow message="페이지를 불러오는 중입니다." />
      ) : null}

      {overviewState.status === "error" ? (
        <p
          className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
          role="alert"
        >
          {overviewState.message}
        </p>
      ) : null}

      {overview ? (
        <p className="mt-5 text-xs font-semibold text-slate-500">
          조회 날짜 {submittedDate}
        </p>
      ) : null}

      {overview ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">
              {reservationStatusLabel.reserved}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {overview.reservations.reserved}건
            </p>
            <p className="mt-1 text-xs text-slate-500">
              전체 {overview.reservations.total}건
            </p>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">
              {reservationStatusLabel.used}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {overview.reservations.used}건
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {reservationStatusLabel.cancelled} {overview.reservations.cancelled}건
              {getCancellationRateLabel(overview)
                ? ` (${getCancellationRateLabel(overview)})`
                : ""}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">예상 매출</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {formatGymPrice(overview.revenue.expected)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {reservationStatusLabel.used} {formatGymPrice(overview.revenue.used)}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">슬롯 사용률</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {getSlotUsageLabel(overview)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              마감 {overview.slots.closed}개 · 정원마감 {overview.slots.full}개
            </p>
          </div>
        </div>
      ) : null}

      {trendState.status === "error" ? (
        <p
          className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
          role="alert"
        >
          {trendState.message}
        </p>
      ) : null}

      {trend ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-slate-500">
            최근 {TREND_DAYS}일 예약 추이 ({shiftDate(submittedDate, -(TREND_DAYS - 1))} ~ {submittedDate})
          </h3>
          <div className="mt-2">
            <ReservationTrendChart trend={trend} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
