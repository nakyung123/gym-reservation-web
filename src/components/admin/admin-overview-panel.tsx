"use client";

import { useCallback, useState } from "react";
import {
  fetchAdminOverview,
  type AdminReservationOverview,
} from "@/lib/admin/admin-overview-client";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { reservationStatusLabel } from "@/components/reservation-ticket";

type OverviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; overview: AdminReservationOverview }
  | { status: "error"; message: string };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getTodayValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
  const [overviewState, setOverviewState] = useState<OverviewState>({
    status: "idle",
  });

  const handleQuery = useCallback(async () => {
    setOverviewState({ status: "loading" });
    const result = await fetchAdminOverview(selectedDate);

    if (result.ok) {
      setOverviewState({ status: "ready", overview: result.overview });
      return;
    }

    setOverviewState({ status: "error", message: result.message });
  }, [selectedDate]);

  const overview =
    overviewState.status === "ready" ? overviewState.overview : null;

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950">운영 요약</h2>
          <p className="mt-1 text-xs text-slate-500">
            날짜별 예약 상태, 예상 매출, 관리된 슬롯 현황을 확인합니다.
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
            disabled={overviewState.status === "loading"}
            className="h-10 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {overviewState.status === "loading" ? (
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

      <p className="mt-3 text-xs font-semibold text-slate-500">
        관리자 권한이 부여된 Firebase 계정으로 로그인한 상태에서만 조회됩니다.
      </p>

      {overviewState.status === "idle" ? (
        <AdminEmptyState
          title="아직 운영 요약을 조회하지 않았습니다"
          description="날짜를 선택한 뒤 조회를 누르면 요약이 표시됩니다."
        />
      ) : null}

      {overviewState.status === "loading" ? (
        <AdminLoadingRow message="운영 요약을 불러오는 중입니다." />
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
          조회 날짜 {selectedDate}
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
    </section>
  );
}
