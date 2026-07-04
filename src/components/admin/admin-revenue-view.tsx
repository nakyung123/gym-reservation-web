"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdminRevenue } from "@/lib/admin/admin-revenue-client";
import { REVENUE_BASIS_LABEL, type RevenueSummary } from "@/lib/admin/revenue";
import { revenueCsvFilename, toRevenueCsv } from "@/lib/admin/revenue-csv";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { reservationStatusLabel } from "@/components/reservation-ticket";

type RevenueState =
  | { status: "loading" }
  | { status: "ready"; summary: RevenueSummary }
  | { status: "error"; message: string };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getCurrentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// month는 1-12. 해당 월의 1일~말일을 YYYY-MM-DD 범위로 만든다.
function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

// JS Date로 월 경계(연도 롤오버 포함)를 안전하게 이동한다.
function shiftMonth(year: number, month: number, delta: number) {
  const base = new Date(year, month - 1 + delta, 1);
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
}

// 요약을 CSV로 직렬화해 브라우저 다운로드를 트리거한다. 직렬화 자체는 순수 util(revenue-csv).
function downloadRevenueCsv(summary: RevenueSummary) {
  const blob = new Blob([toRevenueCsv(summary)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = revenueCsvFilename(summary);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function SummaryCard({
  label,
  value,
  sub,
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        emphasis
          ? "border-accent/30 bg-accent-tint"
          : "border-line bg-slate-50"
      }`}
    >
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          emphasis ? "text-accent-strong" : "text-slate-950"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function AdminRevenueView() {
  const [{ year, month }, setMonth] = useState(getCurrentMonth);
  const [state, setState] = useState<RevenueState>({ status: "loading" });

  // year/month가 바뀌면 해당 월 범위로 자동 재조회한다.
  // effect body에서 곧바로 setState 하지 않도록 setTimeout(0)로 미룬다(다른 admin view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = monthRange(year, month);

    const timer = window.setTimeout(() => {
      void (async () => {
        setState({ status: "loading" });
        try {
          const result = await fetchAdminRevenue(from, to, controller.signal);
          if (controller.signal.aborted) return;
          if (result.ok) {
            setState({ status: "ready", summary: result.summary });
          } else {
            setState({ status: "error", message: result.message });
          }
        } catch {
          // AbortError는 다음 effect가 재요청하므로 무시한다.
        }
      })();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [year, month]);

  const summary = state.status === "ready" ? state.summary : null;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="text-xs font-semibold text-accent-strong hover:underline"
          >
            ← 운영 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-950">매출/정산</h1>
          <p className="text-sm text-slate-600">
            월별 매출과 시설별 정산 기초를 확인합니다. 결제 연동 전이라 장부상
            예약가치(예약 시점 가격) 기준입니다.
          </p>
        </header>

        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-950">매출/정산 요약</h2>
            <p className="mt-1 text-xs text-slate-500">
              결제 연동 전이므로 실제 수금액이 아닌 <strong>장부상 예약가치</strong>
              (예약 시점 가격) 기준입니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(year, month, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-slate-600 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="이전 달"
            >
              ◀
            </button>
            <span className="min-w-[110px] text-center text-sm font-bold text-slate-950">
              {year}년 {month}월
            </span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(year, month, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-slate-600 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>

        {state.status === "loading" ? (
          <AdminLoadingRow message="페이지를 불러오는 중입니다." />
        ) : null}

        {state.status === "error" ? (
          <p
            className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        {summary ? (
          <>
            <p className="mt-4 text-xs font-semibold text-slate-500">
              집계 기간 {summary.from} ~ {summary.to}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCard
                label={`매출 · ${REVENUE_BASIS_LABEL.used}`}
                value={formatGymPrice(summary.revenue.used)}
                sub={`${reservationStatusLabel.used} ${summary.counts.used}건`}
                emphasis
              />
              <SummaryCard
                label={`매출 · ${REVENUE_BASIS_LABEL.expected}`}
                value={formatGymPrice(summary.revenue.expected)}
                sub={`${reservationStatusLabel.reserved} + ${reservationStatusLabel.used}`}
              />
              <SummaryCard
                label="예약 건수"
                value={`${summary.counts.total}건`}
                sub={`${reservationStatusLabel.reserved} ${summary.counts.reserved} · ${reservationStatusLabel.used} ${summary.counts.used} · ${reservationStatusLabel.cancelled} ${summary.counts.cancelled}`}
              />
            </div>
          </>
        ) : null}
      </div>

      {summary ? (
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-950">시설별 정산</h2>
              <p className="mt-1 text-xs text-slate-500">
                {REVENUE_BASIS_LABEL.used} 매출 기준 내림차순입니다.
              </p>
            </div>
            {summary.gyms.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadRevenueCsv(summary)}
                className="shrink-0 rounded-md border border-line-strong px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                CSV 내보내기
              </button>
            ) : null}
          </div>

          {summary.gyms.length === 0 ? (
            <AdminEmptyState
              title="이 기간에 예약이 없습니다"
              description="다른 달을 선택하면 매출이 표시됩니다."
            />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-3">시설</th>
                    <th className="py-2 px-3 text-right">
                      {reservationStatusLabel.reserved}
                    </th>
                    <th className="py-2 px-3 text-right">
                      {reservationStatusLabel.used}
                    </th>
                    <th className="py-2 px-3 text-right">
                      {reservationStatusLabel.cancelled}
                    </th>
                    <th className="py-2 px-3 text-right">
                      {REVENUE_BASIS_LABEL.expected}
                    </th>
                    <th className="py-2 pl-3 text-right">
                      {REVENUE_BASIS_LABEL.used}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.gyms.map((gym) => (
                    <tr
                      key={gym.gymId}
                      className="border-b border-line/60 text-slate-800"
                    >
                      <td className="py-2.5 pr-3 font-semibold text-slate-950">
                        {gym.gymName}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {gym.counts.reserved}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {gym.counts.used}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                        {gym.counts.cancelled}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {formatGymPrice(gym.revenue.expected)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-accent-strong">
                        {formatGymPrice(gym.revenue.used)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-slate-950">
                    <td className="py-2.5 pr-3 font-bold">합계</td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                      {summary.counts.reserved}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                      {summary.counts.used}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-slate-500">
                      {summary.counts.cancelled}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                      {formatGymPrice(summary.revenue.expected)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-accent-strong">
                      {formatGymPrice(summary.revenue.used)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : null}
        </div>
      </section>
    </main>
  );
}
