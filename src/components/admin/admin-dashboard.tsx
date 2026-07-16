"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAdminOverview,
  fetchAdminOverviewTrend,
  type AdminReservationOverview,
  type AdminReservationTrendPoint,
} from "@/lib/admin/admin-overview-client";
import { fetchAdminInquiries } from "@/lib/admin/inquiry";
import { fetchAdminReservations } from "@/lib/admin/admin-reservation-client";
import { fetchAdminGyms } from "@/lib/admin/admin-gym-client";
import { formatGymPrice } from "@/lib/gym-utils";
import { formatCreatedAt } from "@/lib/admin/admin-date-format";
import { isAbortError } from "@/lib/async-error";
import { ReservationTrendChart } from "@/components/admin/admin-charts";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";
import {
  getShortId,
  statusBadgeStyles,
} from "@/components/admin/admin-reservations-shared";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTr,
} from "@/components/admin/admin-ui";
import { Button, ButtonLink } from "@/components/ui/app-button";
import type { Gym, Reservation } from "@/types/domain";

/**
 * 관리자 대시보드.
 *
 * 여기 있는 숫자는 **전부 기존 API가 실제로 주는 값**이다. 목표 매출·전일 대비 증감처럼
 * 서버에 근거가 없는 지표는 의도적으로 넣지 않는다(추정치를 실측처럼 보이게 하지 않는다).
 *  - 예약/매출/슬롯 : GET /api/admin/overview (기준 날짜 1일)
 *  - 예약 추이      : GET /api/admin/overview/trend (최근 14일)
 *  - 미답변 문의    : GET /api/admin/inquiries?status=open 의 total
 *  - 최근 예약      : GET /api/admin/reservations?limit=5 (createdAt desc)
 *
 * 섹션별로 실패를 따로 표시한다. 한 곳이 실패해도 나머지는 계속 보여주되,
 * 실패한 자리에는 값 대신 오류를 드러낸다(No Silent Fallback).
 */

const TREND_DAYS = 14;
const RECENT_LIMIT = 5;

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

// 정원 대비 예약 비율(0~100, 반올림). KPI 값과 진행 막대가 같은 기준을 쓰도록 분리한다.
function getSlotUsageRatio(overview: AdminReservationOverview): number {
  if (overview.slots.capacity === 0) return 0;
  return Math.round(
    (overview.slots.reservedCount / overview.slots.capacity) * 100,
  );
}

function getSlotUsageLabel(overview: AdminReservationOverview): string {
  return `${getSlotUsageRatio(overview)}%`;
}

// ISO 시각을 "방금 전 / N분 전 / N시간 전 / N일 전"으로 표기(실시간 활동 피드용).
// 파싱 불가하면 절대 표기로 폴백한다(빈 표시 방지).
function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return formatCreatedAt(value);
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.floor(diffHr / 24)}일 전`;
}

// 전체 예약이 0이면 분모가 없어 비율 표시가 의미 없으므로 null을 돌려준다.
function getCancellationRateLabel(
  overview: AdminReservationOverview,
): string | null {
  if (overview.reservations.total === 0) return null;
  const ratio =
    (overview.reservations.cancelled / overview.reservations.total) * 100;
  return `${ratio.toFixed(1)}%`;
}

type DashboardData = {
  overview: AdminReservationOverview | null;
  overviewError: string | null;
  trend: AdminReservationTrendPoint[] | null;
  trendError: string | null;
  openInquiries: number | null;
  inquiriesError: string | null;
  recent: Reservation[] | null;
  recentError: string | null;
  gymsById: Map<string, Gym>;
};

const EMPTY_DATA: DashboardData = {
  overview: null,
  overviewError: null,
  trend: null,
  trendError: null,
  openInquiries: null,
  inquiriesError: null,
  recent: null,
  recentError: null,
  gymsById: new Map(),
};

export function AdminDashboard() {
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  // 실제 조회에 쓰인 날짜. 진입 시 오늘 날짜로 자동 조회한다.
  const [submittedDate, setSubmittedDate] = useState(selectedDate);
  // 같은 날짜 재조회용 nonce.
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);

  // effect body에서 곧바로 setState 하지 않도록 setTimeout(0)으로 미룬다
  // (react-hooks/set-state-in-effect. 다른 admin view와 동일 패턴).
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        const trendFrom = shiftDate(submittedDate, -(TREND_DAYS - 1));

        try {
          const [overview, trend, inquiries, recent, gyms] = await Promise.all([
            fetchAdminOverview(submittedDate, controller.signal),
            fetchAdminOverviewTrend(trendFrom, submittedDate, controller.signal),
            fetchAdminInquiries({ status: "open" }, controller.signal),
            fetchAdminReservations(
              { limit: RECENT_LIMIT },
              controller.signal,
            ),
            fetchAdminGyms(controller.signal),
          ]);
          if (controller.signal.aborted) return;

          setData({
            overview: overview.ok ? overview.overview : null,
            overviewError: overview.ok ? null : overview.message,
            trend: trend.ok ? trend.trend : null,
            trendError: trend.ok ? null : trend.message,
            openInquiries: inquiries.ok ? inquiries.total : null,
            inquiriesError: inquiries.ok ? null : inquiries.message,
            recent: recent.ok ? recent.reservations : null,
            recentError: recent.ok ? null : recent.message,
            // 시설명은 부가 정보라, 실패하면 예약 목록은 그대로 두고 시설명만 비운다.
            gymsById: gyms.ok
              ? new Map(gyms.gyms.map((gym) => [gym.id, gym]))
              : new Map(),
          });
          setLoading(false);
        } catch (error) {
          // AbortError(언마운트/재요청)는 무시한다.
          if (!isAbortError(error)) {
            setLoading(false);
          }
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

  const { overview } = data;
  const trendFrom = shiftDate(submittedDate, -(TREND_DAYS - 1));

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      {/* 본문(좌): 지표·추이·표. min-w-0으로 넓은 표가 우측 rail을 밀어내지 않게 한다. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
      {/* 상단 툴바 — 좌측 섹션 제목, 우측 기준 날짜 컨트롤.
          날짜 표기는 우측 달력이 담당하므로 좌측엔 날짜 대신 콘텐츠 성격을 가리키는 제목을 둔다. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[18px] font-bold text-foreground">예약 현황</h2>
          <p className="text-[12.5px] text-subtle">실시간 운영 지표</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="overview-date" className={ADMIN_FIELD_LABEL_CLASS}>
              기준 날짜
            </label>
            <input
              id="overview-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className={ADMIN_CONTROL_CLASS}
            />
          </div>
          <Button size="console" onClick={handleQuery} disabled={loading}>
            {loading ? (
              <>
                <AdminButtonSpinner />
                조회 중
              </>
            ) : (
              "조회"
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <AdminLoadingRow message="대시보드를 불러오는 중입니다." />
      ) : null}

      {data.overviewError ? (
        <AdminErrorNotice message={data.overviewError} />
      ) : null}

      {/* 공공기관 성격에 맞춰 매출 대신 예약·이용·가동률 중심으로 노출한다(레퍼런스 KPI 4칸). */}
      {overview ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCell
            label="오늘 예약"
            value={`${overview.reservations.reserved}건`}
            sub={`전체 ${overview.reservations.total}건`}
          />
          <StatCell
            label="이용 완료"
            value={`${overview.reservations.used}건`}
            sub={`취소 ${overview.reservations.cancelled} · 취소율 ${
              getCancellationRateLabel(overview) ?? "—"
            }`}
          />
          <StatCell
            label="슬롯 사용률"
            value={getSlotUsageLabel(overview)}
            bar={getSlotUsageRatio(overview)}
            sub={`${overview.slots.reservedCount}/${overview.slots.capacity}명`}
          />
          <StatCell
            label="미답변 문의"
            value={data.openInquiries === null ? "—" : `${data.openInquiries}건`}
            sub={
              data.inquiriesError
                ? "불러오기 실패"
                : data.openInquiries && data.openInquiries > 0
                  ? "확인 필요"
                  : "없음"
            }
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <AdminPanel
          title="예약 추이"
          description={`최근 ${TREND_DAYS}일 (${trendFrom} ~ ${submittedDate})`}
          className="lg:col-span-2"
        >
          {data.trendError ? (
            <AdminErrorNotice message={data.trendError} />
          ) : null}
          {data.trend ? <ReservationTrendChart trend={data.trend} /> : null}
        </AdminPanel>

        <AdminPanel
          title="확인이 필요한 항목"
          description="지금 조치가 필요한 건수입니다."
          className="flex flex-col"
        >
          {/* flex-1 행으로 패널 높이를 균등하게 채운다(옆 추이 차트와 높이가 맞아 하단 여백이 남지 않게). */}
          <div className="flex flex-1 flex-col gap-2.5">
            {data.inquiriesError ? (
              <AdminErrorNotice message={data.inquiriesError} />
            ) : (
              <ActionRow
                href="/admin/inquiries"
                label="미답변 문의"
                hint="고객이 기다리는 1:1 문의"
                count={data.openInquiries}
                unit="건"
                tone={
                  data.openInquiries && data.openInquiries > 0
                    ? "alert"
                    : "quiet"
                }
              />
            )}
            <ActionRow
              href="/admin/reservation-slots"
              label="정원 마감 슬롯"
              hint="정원이 가득 찬 시간대"
              count={overview?.slots.full ?? null}
              unit="개"
              tone="quiet"
            />
            <ActionRow
              href="/admin/reservation-slots"
              label="운영 마감 슬롯"
              hint="운영자가 마감한 시간대"
              count={overview?.slots.closed ?? null}
              unit="개"
              tone="quiet"
            />
          </div>
        </AdminPanel>
      </div>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-foreground">최근 예약</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              최근 등록된 {RECENT_LIMIT}건입니다.
            </p>
          </div>
          <ButtonLink
            href="/admin/reservations"
            variant="outline"
            size="console"
          >
            전체 보기
          </ButtonLink>
        </div>

        {data.recentError ? (
          <AdminErrorNotice message={data.recentError} />
        ) : null}

        {data.recent && data.recent.length === 0 ? (
          <AdminEmptyState
            title="아직 예약이 없습니다."
            description="고객이 예약하면 여기에 최근 순으로 표시됩니다."
          />
        ) : null}

        {data.recent && data.recent.length > 0 ? (
          <AdminTable
            minWidth="min-w-[760px]"
            columns={[
              { label: "예약번호" },
              { label: "시설 · 종목" },
              { label: "이용 일시" },
              { label: "금액", align: "right" },
              { label: "상태" },
              { label: "등록" },
            ]}
          >
            {data.recent.map((reservation) => (
              <AdminTr key={reservation.id}>
                <AdminTd numeric className="font-bold">
                  {getShortId(reservation.id)}
                </AdminTd>
                <AdminTd>
                  <span className="font-semibold">
                    {data.gymsById.get(reservation.gymId)?.name ??
                      "시설 정보 없음"}
                  </span>
                  <span className="text-muted"> · {reservation.sport}</span>
                </AdminTd>
                <AdminTd numeric>
                  {reservation.date} {reservation.time}
                </AdminTd>
                <AdminTd numeric align="right" className="font-semibold">
                  {formatGymPrice(reservation.price)}
                </AdminTd>
                <AdminTd>
                  <span
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[11.5px] font-bold ${statusBadgeStyles[reservation.status]}`}
                  >
                    {reservationStatusLabel[reservation.status]}
                  </span>
                </AdminTd>
                <AdminTd numeric className="text-muted">
                  {formatCreatedAt(reservation.createdAt)}
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTable>
        ) : null}
      </section>
      </div>

      {/* 우측 rail: 레퍼런스의 실시간 활동 + 담당 시설. 목업은 셸 기둥이지만,
          다중 페이지 앱에선 데이터가 있는 대시보드 우측 컬럼으로만 둔다(다른 페이지는 full-width).
          숫자를 지어내지 않으려고 활동은 실제 최근 예약에서 파생하고, 시설은 카운트 없이 목록만 낸다. */}
      <ActivityRail
        recent={data.recent}
        recentError={data.recentError}
        gyms={Array.from(data.gymsById.values())}
        gymsById={data.gymsById}
      />
    </div>
  );
}

// KPI 한 칸. 값이 주인공이라 라벨(12px)보다 훨씬 크게(24px) 둔다.
// bar를 주면 값 아래 퍼플 진행 막대를 그린다(슬롯 사용률 등 비율 지표용).
function StatCell({
  label,
  value,
  sub,
  bar,
}: {
  label: string;
  value: string;
  sub: string;
  bar?: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-[12px] font-bold text-muted">{label}</p>
      <p className="admin-num mt-1 text-[24px] font-bold text-foreground">
        {value}
      </p>
      {typeof bar === "number" ? (
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
          />
        </div>
      ) : null}
      <p className="admin-num mt-1 text-[12px] text-subtle">{sub}</p>
    </div>
  );
}

// 예약 상태 → 실시간 활동 표기(라벨·아이콘·톤). 취소만 경고(빨강 틴트), 나머지는 퍼플.
const ACTIVITY_META: Record<
  Reservation["status"],
  { label: string; warn: boolean; path: string }
> = {
  reserved: { label: "예약 등록", warn: false, path: "M12 5v14M5 12h14" },
  used: { label: "이용 완료", warn: false, path: "M20 6L9 17l-5-5" },
  cancelled: { label: "예약 취소", warn: true, path: "M6 6l12 12M18 6L6 18" },
};

/**
 * 대시보드 우측 rail. 레퍼런스의 "실시간 활동 + 담당 시설"을 데이터 정직하게 옮긴다.
 *  - 실시간 활동: 최근 예약(createdAt desc)을 등록/완료/취소로 표기(추정 없음).
 *  - 등록 시설: 시설 목록만(예약·문의 건별 카운트는 집계 API가 없어 지어내지 않는다).
 */
function ActivityRail({
  recent,
  recentError,
  gyms,
  gymsById,
}: {
  recent: Reservation[] | null;
  recentError: string | null;
  gyms: Gym[];
  gymsById: Map<string, Gym>;
}) {
  return (
    <aside className="flex flex-col xl:w-75 xl:shrink-0">
      <div className="rounded-xl border border-line bg-white p-2">
        <h2 className="px-3 pb-1 pt-2.5 text-[13px] font-bold text-foreground">
          실시간 활동
        </h2>
        {recentError ? (
          <div className="px-2 pb-2">
            <AdminErrorNotice message={recentError} />
          </div>
        ) : null}
        {recent && recent.length === 0 ? (
          <p className="px-3 pb-3 pt-1 text-[12.5px] text-subtle">
            최근 활동이 없습니다.
          </p>
        ) : null}
        <ul className="flex flex-col">
          {(recent ?? []).map((reservation) => (
            <ActivityRow
              key={reservation.id}
              reservation={reservation}
              gymName={gymsById.get(reservation.gymId)?.name ?? null}
            />
          ))}
        </ul>

        <div className="my-2 h-px bg-line" />

        <div className="flex items-center justify-between px-3 pb-1 pt-1">
          <h2 className="text-[13px] font-bold text-foreground">등록 시설</h2>
          <Link
            href="/admin/gyms"
            className="text-[12px] font-semibold text-accent-strong transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            시설 관리
          </Link>
        </div>
        <ul className="flex flex-col">
          {gyms.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-subtle">
              등록된 시설이 없습니다.
            </li>
          ) : (
            gyms.slice(0, 6).map((gym) => (
              <li key={gym.id} className="rounded-xl px-3 py-2.5">
                <p className="truncate text-[13.5px] font-semibold text-foreground">
                  {gym.name}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted">
                  {gym.region}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}

// 실시간 활동 한 줄. 상태별 아이콘·톤 + 상대 시각(+시설명).
function ActivityRow({
  reservation,
  gymName,
}: {
  reservation: Reservation;
  gymName: string | null;
}) {
  const meta = ACTIVITY_META[reservation.status];
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${
          meta.warn
            ? "bg-error/10 text-error"
            : "bg-accent-tint text-accent-strong"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-4.25"
        >
          <path d={meta.path} />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="admin-num truncate text-[13px] font-semibold text-foreground">
          {meta.label} · {getShortId(reservation.id)}
        </p>
        <p className="admin-num mt-0.5 truncate text-[12px] text-muted">
          {relativeTime(reservation.createdAt)}
          {gymName ? ` · ${gymName}` : ""}
        </p>
      </div>
    </li>
  );
}

// 조치가 필요한 항목 한 줄. 건수를 모르면(조회 실패/미조회) 숫자를 지어내지 않고 "—"로 둔다.
// flex-1로 패널 높이를 나눠 채우고, hint 한 줄로 행을 키워 하단 여백을 없앤다.
function ActionRow({
  href,
  label,
  hint,
  count,
  unit,
  tone,
}: {
  href: string;
  label: string;
  hint: string;
  count: number | null;
  unit: string;
  tone: "alert" | "quiet";
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 transition hover:border-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-foreground">
          {label}
        </span>
        <span className="text-[12px] text-subtle">{hint}</span>
      </span>
      <span
        className={`inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2 text-[12px] font-bold tabular-nums ${
          tone === "alert"
            ? "bg-error/10 text-error"
            : "bg-surface-2 text-muted"
        }`}
      >
        {count === null ? "—" : `${count}${unit}`}
      </span>
    </Link>
  );
}
