"use client";

import { useEffect, useState } from "react";
import { fetchAdminRevenue } from "@/lib/admin/admin-revenue-client";
import {
  AdminErrorNotice,
  AdminTable,
  AdminTd,
  AdminTr,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
import { REVENUE_BASIS_LABEL, type RevenueSummary } from "@/lib/admin/revenue";
import { revenueCsvFilename, toRevenueCsv } from "@/lib/admin/revenue-csv";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import {
  GYM_REVENUE_CHART_MAX_BARS,
  GymRevenueBarChart,
  MonthlyRevenueChart,
  type GymRevenueDatum,
  type MonthlyRevenuePoint,
} from "@/components/admin/admin-charts";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";

type RevenueState =
  | { status: "loading" }
  | { status: "ready"; summary: RevenueSummary }
  | { status: "error"; message: string };

type TrendState =
  | { status: "loading" }
  | { status: "ready"; points: MonthlyRevenuePoint[] }
  | { status: "error"; message: string };

// 월별 추이 차트 범위(선택 월 포함 최근 6개월).
const TREND_MONTHS = 6;

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
      className={`rounded-xl border p-5 ${
        emphasis ? "border-accent/30 bg-accent-tint" : "border-line bg-surface-2"
      }`}
    >
      <p className="text-[12.5px] font-bold text-muted">{label}</p>
      <p
        className={`admin-num mt-2 text-[22px] font-bold ${
          emphasis ? "text-accent-strong" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="admin-num mt-1 text-[13px] text-muted">{sub}</p>
      ) : null}
    </div>
  );
}

export function AdminRevenueView() {
  const [{ year, month }, setMonth] = useState(getCurrentMonth);
  const [state, setState] = useState<RevenueState>({ status: "loading" });
  const [trendState, setTrendState] = useState<TrendState>({
    status: "loading",
  });

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

      // 월별 추이: 선택 월 포함 최근 6개월을 병렬 조회해 합산한다(기존 API 재사용).
      void (async () => {
        setTrendState({ status: "loading" });
        const months = Array.from({ length: TREND_MONTHS }, (_, index) =>
          shiftMonth(year, month, index - (TREND_MONTHS - 1)),
        );
        try {
          const results = await Promise.all(
            months.map((target) => {
              const range = monthRange(target.year, target.month);
              return fetchAdminRevenue(range.from, range.to, controller.signal);
            }),
          );
          if (controller.signal.aborted) return;

          const ready = results.filter(
            (result): result is Extract<typeof result, { ok: true }> =>
              result.ok,
          );
          if (ready.length !== results.length) {
            // 일부 월만 성공해도 성공처럼 그리지 않는다(No Silent Fallback).
            const failed = results.find((result) => !result.ok);
            setTrendState({
              status: "error",
              message:
                failed && !failed.ok
                  ? failed.message
                  : "월별 매출 추이를 불러오지 못했습니다.",
            });
            return;
          }

          const points: MonthlyRevenuePoint[] = ready.map((result, index) => {
            const target = months[index];
            return {
              month: `${target.year}-${pad(target.month)}`,
              used: result.summary.revenue.used,
              expected: result.summary.revenue.expected,
            };
          });
          setTrendState({ status: "ready", points });
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
  const trendPoints = trendState.status === "ready" ? trendState.points : null;

  // 시설별 차트 데이터: 확정 매출 내림차순 상위 N개 + 나머지 "기타" 합산(범주 과다 방지).
  const gymChartData: GymRevenueDatum[] | null =
    summary && summary.gyms.length > 0
      ? (() => {
          const sorted = [...summary.gyms].sort(
            (a, b) => b.revenue.used - a.revenue.used,
          );
          const top = sorted
            .slice(0, GYM_REVENUE_CHART_MAX_BARS)
            .map((gym) => ({ gymName: gym.gymName, used: gym.revenue.used }));
          const rest = sorted.slice(GYM_REVENUE_CHART_MAX_BARS);
          if (rest.length > 0) {
            top.push({
              gymName: `기타 ${rest.length}개`,
              used: rest.reduce((sum, gym) => sum + gym.revenue.used, 0),
            });
          }
          return top;
        })()
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-foreground">
              매출/정산 요약
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              결제 연동 전이므로 실제 수금액이 아닌 <strong>장부상 예약가치</strong>
              (예약 시점 가격) 기준입니다.
            </p>
          </div>

          {/* 월 이동은 사이트 표준 chevron(페이지네이션과 동일 SVG·크기)을 쓴다. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(year, month, -1))}
              className={MONTH_NAV_CLASS}
              aria-label="이전 달"
            >
              <ChevronIcon direction="prev" />
            </button>
            <span className="min-w-[110px] text-center text-[13.5px] font-bold tabular-nums text-foreground">
              {year}년 {month}월
            </span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(year, month, 1))}
              className={MONTH_NAV_CLASS}
              aria-label="다음 달"
            >
              <ChevronIcon direction="next" />
            </button>
          </div>
        </div>

        {state.status === "loading" ? (
          <div className="mt-5">
            <AdminLoadingRow message="페이지를 불러오는 중입니다." />
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="mt-5">
            <AdminErrorNotice message={state.message} />
          </div>
        ) : null}

        {summary ? (
          <>
            <p className="mt-5 text-[13px] font-semibold tabular-nums text-muted">
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

      <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-bold text-foreground">
          월별 매출 추이 (최근 {TREND_MONTHS}개월)
        </h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
          막대는 {REVENUE_BASIS_LABEL.used}, 선은 {REVENUE_BASIS_LABEL.expected}
          입니다.
        </p>

        {trendState.status === "loading" ? (
          <div className="mt-5">
            <AdminLoadingRow message="월별 매출 추이를 불러오는 중입니다." />
          </div>
        ) : null}

        {trendState.status === "error" ? (
          <div className="mt-5">
            <AdminErrorNotice message={trendState.message} />
          </div>
        ) : null}

        {trendPoints ? (
          <div className="mt-4">
            <MonthlyRevenueChart
              points={trendPoints}
              usedLabel={REVENUE_BASIS_LABEL.used}
              expectedLabel={REVENUE_BASIS_LABEL.expected}
            />
          </div>
        ) : null}
      </div>

      {summary ? (
        <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-foreground">
                시설별 정산
              </h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                {REVENUE_BASIS_LABEL.used} 매출 기준 내림차순입니다.
              </p>
            </div>
            {summary.gyms.length > 0 ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => downloadRevenueCsv(summary)}
                className="shrink-0"
              >
                CSV 내보내기
              </Button>
            ) : null}
          </div>

          {gymChartData ? (
            <div className="mt-5">
              <GymRevenueBarChart data={gymChartData} />
            </div>
          ) : null}

          <div className="mt-5">
            {summary.gyms.length === 0 ? (
              <AdminEmptyState
                title="이 기간에 예약이 없습니다"
                description="다른 달을 선택하면 매출이 표시됩니다."
              />
            ) : (
              // 콘솔 표 SSOT(AdminTable). 합계는 tfoot 대신 표 아래 footer 행으로 둔다.
              <AdminTable
                minWidth="min-w-[760px]"
                columns={[
                  { label: "시설" },
                  { label: reservationStatusLabel.reserved, align: "right" },
                  { label: reservationStatusLabel.used, align: "right" },
                  { label: reservationStatusLabel.cancelled, align: "right" },
                  { label: REVENUE_BASIS_LABEL.expected, align: "right" },
                  { label: REVENUE_BASIS_LABEL.used, align: "right" },
                ]}
                footer={
                  <div className="flex items-center justify-between gap-4 bg-surface-2 px-3.5 py-3 text-[13.5px]">
                    <span className="font-bold text-foreground">합계</span>
                    <span className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 tabular-nums">
                      <SummaryStat
                        label={reservationStatusLabel.reserved}
                        value={String(summary.counts.reserved)}
                      />
                      <SummaryStat
                        label={reservationStatusLabel.used}
                        value={String(summary.counts.used)}
                      />
                      <SummaryStat
                        label={reservationStatusLabel.cancelled}
                        value={String(summary.counts.cancelled)}
                      />
                      <SummaryStat
                        label={REVENUE_BASIS_LABEL.expected}
                        value={formatGymPrice(summary.revenue.expected)}
                      />
                      <SummaryStat
                        label={REVENUE_BASIS_LABEL.used}
                        value={formatGymPrice(summary.revenue.used)}
                        emphasis
                      />
                    </span>
                  </div>
                }
              >
                {summary.gyms.map((gym) => (
                  <AdminTr key={gym.gymId}>
                    <AdminTd className="font-semibold">{gym.gymName}</AdminTd>
                    <AdminTd align="right" className="tabular-nums">
                      {gym.counts.reserved}
                    </AdminTd>
                    <AdminTd align="right" className="tabular-nums">
                      {gym.counts.used}
                    </AdminTd>
                    <AdminTd align="right" className="tabular-nums text-muted">
                      {gym.counts.cancelled}
                    </AdminTd>
                    <AdminTd align="right" className="tabular-nums">
                      {formatGymPrice(gym.revenue.expected)}
                    </AdminTd>
                    <AdminTd
                      align="right"
                      className="font-bold tabular-nums text-accent-strong"
                    >
                      {formatGymPrice(gym.revenue.used)}
                    </AdminTd>
                  </AdminTr>
                ))}
              </AdminTable>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 합계 행의 항목 하나. 라벨을 붙여 열 위치에 기대지 않게 한다(footer는 표 밖이라 열이 없다).
function SummaryStat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      <span
        className={`font-bold ${emphasis ? "text-accent-strong" : "text-foreground"}`}
      >
        {value}
      </span>
    </span>
  );
}

// 월 이동 버튼(콘솔 컨트롤과 같은 높이: size-9, rounded-lg, line 보더).
const MONTH_NAV_CLASS =
  "grid size-9 place-items-center rounded-lg border border-line-strong text-muted transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

// 사이트 표준 chevron. BoardPagination의 PagerIcon과 같은 형태·굵기를 쓴다.
function ChevronIcon({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d={direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
