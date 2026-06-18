"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useCurrentMinuteValue } from "@/hooks/use-current-minute";
import { formatGymPrice } from "@/lib/gym-utils";
import { createUserReservationDetail } from "@/lib/reservation-detail";
import {
  getReservationRangeLowerBound,
  getTodayDateValue,
  isReservationDateInRange,
  parseReservationRange,
  type ReservationRange,
} from "@/lib/reservation-range";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  formatCancellationDeadline,
  formatReservationCreatedAt,
  getReservationGymSummary,
  ReservationAdmissionTicket,
  ReservationInactiveTicket,
  reservationStatusBadgeStyles,
  ReservationUnavailableTicket,
} from "@/components/reservation-ticket";
import type { Gym, Reservation } from "@/types/domain";

const noticeStyles = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
};

type ReservationFilter = "all" | "reserved" | "used" | "cancelled";
type ReservationSort = "upcoming" | "recent";

// 필터/정렬/기간 버튼 순서(라벨 텍스트는 messages에서 가져온다).
const RESERVATION_FILTERS: ReservationFilter[] = [
  "all",
  "reserved",
  "used",
  "cancelled",
];
const RESERVATION_SORTS: ReservationSort[] = ["upcoming", "recent"];
const RESERVATION_RANGES: ReservationRange[] = [
  "all",
  "week",
  "month",
  "quarter",
];

// URL ?status=... 쿼리는 /api/reservations 의 status 필터와 동일한 어휘를 사용한다.
// 값이 없거나 지원하지 않으면 "all"로 해석한다.
function parseFilterFromParam(value: string | null): ReservationFilter {
  if (value === "reserved" || value === "used" || value === "cancelled") {
    return value;
  }
  return "all";
}

// URL ?sort=upcoming|recent. 잘못된 값은 default "upcoming"으로 해석한다.
function parseSortFromParam(value: string | null): ReservationSort {
  if (value === "recent") {
    return "recent";
  }
  return "upcoming";
}

// 예약중을 먼저 묶어 이용 일시 오름차순으로 보여주고, 그 외 상태는 생성 시각
// 내림차순으로 정렬한다. (기본 정렬)
function compareReservationsByUpcoming(left: Reservation, right: Reservation) {
  const leftGroup = left.status === "reserved" ? 0 : 1;
  const rightGroup = right.status === "reserved" ? 0 : 1;

  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }

  if (left.status === "reserved" && right.status === "reserved") {
    return (
      `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`) ||
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  return right.createdAt.localeCompare(left.createdAt);
}

// 모든 예약을 createdAt 내림차순으로만 정렬한다.
function compareReservationsByRecent(left: Reservation, right: Reservation) {
  return right.createdAt.localeCompare(left.createdAt);
}

function getReservationComparator(sort: ReservationSort) {
  return sort === "recent"
    ? compareReservationsByRecent
    : compareReservationsByUpcoming;
}

type ReservationsViewProps = {
  gyms: Gym[];
};

export function ReservationsView({ gyms }: ReservationsViewProps) {
  const t = useTranslations("Reservations");
  const tReservation = useTranslations("Reservation");
  // 필터/기간 라벨 헬퍼. 상태/기간 텍스트는 공유 Reservation namespace를 따른다.
  const filterLabel = (filter: ReservationFilter) =>
    filter === "all" ? t("filterAll") : tReservation(`status.${filter}`);
  const rangeText = (range: ReservationRange) => tReservation(`range.${range}`);
  const sortLabel = (sort: ReservationSort) =>
    t(sort === "upcoming" ? "sortUpcoming" : "sortRecent");
  // 필터 상태는 URL ?status= 쿼리를 SSOT로 본다. router.replace로 갱신하면
  // useSearchParams가 새 값을 내려주고, 그 결과로 displayReservations가 재계산된다.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reservationFilter = parseFilterFromParam(searchParams.get("status"));
  const reservationSort = parseSortFromParam(searchParams.get("sort"));
  // ?range=week|month|quarter. 기본 "all"은 URL에 기록하지 않는다.
  const reservationRange = parseReservationRange(searchParams.get("range"));

  // 미로그인 시 /login?from=<현재경로+쿼리> 로 redirect.
  // 예: /reservations?status=cancelled 로 진입한 경우 로그인 후 필터까지 복원되도록 쿼리를 보존한다.
  const searchParamsQuery = searchParams.toString();
  const authFromPath = searchParamsQuery
    ? `${pathname}?${searchParamsQuery}`
    : pathname;
  useRequireAuth({ from: authFromPath });

  const [actionNotice, setActionNotice] = useState<{
    tone: keyof typeof noticeStyles;
    message: string;
  } | null>(null);
  const [cancellingReservationId, setCancellingReservationId] = useState<
    string | null
  >(null);
  const [pendingCancelReservationId, setPendingCancelReservationId] = useState<
    string | null
  >(null);
  const updateReservationFilter = (next: ReservationFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  // sort default("upcoming")은 URL에 기록하지 않아 깔끔한 기본 URL을 유지한다.
  const updateReservationSort = (next: ReservationSort) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "upcoming") {
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  // range default("all")는 URL에 기록하지 않는다.
  const updateReservationRange = (next: ReservationRange) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("range");
    } else {
      params.set("range", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const reservationSnapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  const currentMinuteValue = useCurrentMinuteValue();
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
  );
  const gymsById = useMemo(
    () => new Map(gyms.map((gym) => [gym.id, gym])),
    [gyms],
  );
  const missingGymReservationCount = useMemo(
    () =>
      reservations.filter((reservation) => !gymsById.has(reservation.gymId))
        .length,
    [gymsById, reservations],
  );

  // 최근 예약한 시설 5개. createdAt 내림차순으로 훑으며 gymId 중복을 제거하고,
  // 현재 운영 중인 시설 목록(gymsById)에 없는 gymId는 건너뛴다. 최근 선택한 종목을
  // 함께 보존해 같은 시설 예약 진입 시 종목을 미리 선택한다.
  const recentGymEntries = useMemo(() => {
    const sorted = [...reservations].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    const seen = new Set<string>();
    const result: Pick<Reservation, "gymId" | "sport">[] = [];
    for (const reservation of sorted) {
      if (seen.has(reservation.gymId)) continue;
      seen.add(reservation.gymId);
      if (!gymsById.has(reservation.gymId)) continue;
      result.push({
        gymId: reservation.gymId,
        sport: reservation.sport,
      });
      if (result.length >= 5) break;
    }
    return result;
  }, [gymsById, reservations]);

  const activeReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status === "reserved"),
    [reservations],
  );
  const cancelledReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status === "cancelled"),
    [reservations],
  );
  const usedReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "used"),
    [reservations],
  );
  const filterCounts: Record<ReservationFilter, number> = {
    all: reservations.length,
    reserved: activeReservations.length,
    used: usedReservations.length,
    cancelled: cancelledReservations.length,
  };
  // 기간 필터 하한은 현재 분 단위 시각으로 환산한 오늘 날짜 기준으로 계산한다.
  // 분 갱신 hook이 자정을 넘기면 today가 자동으로 다음 날로 바뀐다.
  const rangeLowerBound = useMemo(() => {
    const today = currentMinuteValue
      ? getTodayDateValue(new Date(currentMinuteValue))
      : getTodayDateValue();
    return getReservationRangeLowerBound(reservationRange, today);
  }, [currentMinuteValue, reservationRange]);
  const displayReservations = useMemo(
    () =>
      reservations
        .filter((reservation) =>
          reservationFilter === "all"
            ? true
            : reservation.status === reservationFilter,
        )
        .filter((reservation) =>
          isReservationDateInRange(reservation.date, rangeLowerBound),
        )
        .sort(getReservationComparator(reservationSort)),
    [
      rangeLowerBound,
      reservationFilter,
      reservationSort,
      reservations,
    ],
  );

  const requestCancel = (reservationId: string) => {
    if (cancellingReservationId) {
      return;
    }

    setActionNotice(null);
    setPendingCancelReservationId(reservationId);
  };

  const handleCancel = async (reservationId: string) => {
    if (cancellingReservationId) {
      return;
    }

    setCancellingReservationId(reservationId);
    setPendingCancelReservationId(null);

    try {
      const result = await reservationRepository.cancel(reservationId);

      setActionNotice({
        tone: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch {
      setActionNotice({
        tone: "error",
        message: t("cancelUnexpectedError"),
      });
    } finally {
      setCancellingReservationId(null);
    }
  };

  if (!reservationReadResult.ok) {
    if (reservationReadResult.reason === "not-ready") {
      return (
        <section
          className="mx-auto w-full max-w-4xl rounded-lg border border-line bg-white p-8 text-center shadow-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm font-semibold text-accent-strong">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
            {t("loadingTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t("loadingDesc")}
          </p>
          <div className="mt-6 flex justify-center" aria-hidden="true">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          </div>
        </section>
      );
    }

    return (
      <section
        className="mx-auto w-full max-w-4xl rounded-lg border border-error/30 bg-error/10 p-8 text-center text-error shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold">{t("eyebrow")}</p>
        <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
          {t("loadErrorTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6">{reservationReadResult.message}</p>
      </section>
    );
  }

  if (reservations.length === 0) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-lg border border-line bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
          {t("emptyTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("emptyDesc")}
        </p>
        <Link
          href="/gyms"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("findGym")}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">
          {t("eyebrow")}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">
              {t("countTitle", { count: activeReservations.length })}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {t("headerDesc")}
            </p>
          </div>
          <Link
            href="/gyms"
            className="inline-flex h-10 w-fit shrink-0 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold whitespace-nowrap text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t("addReservation")}
          </Link>
        </div>

        {actionNotice ? (
          <div
            role="alert"
            className={`mt-4 rounded-md border px-4 py-3 text-sm font-semibold ${noticeStyles[actionNotice.tone]}`}
          >
            {actionNotice.message}
          </div>
        ) : null}

        {missingGymReservationCount > 0 ? (
          <div
            className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
            role="status"
          >
            <p className="font-semibold">
              {t("missingGymCount", { count: missingGymReservationCount })}
            </p>
            <p className="mt-1 leading-6">
              {t("missingGymDesc")}
            </p>
          </div>
        ) : null}

        <div
          className="mt-5 flex flex-wrap gap-2"
          role="group"
          aria-label={t("statusFilterAria")}
        >
          {RESERVATION_FILTERS.map(
            (filter) => {
              const isSelected = reservationFilter === filter;

              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setPendingCancelReservationId(null);
                    updateReservationFilter(filter);
                  }}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    isSelected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong bg-white text-slate-700 hover:border-accent hover:text-accent-strong"
                  }`}
                >
                  {filterLabel(filter)}{" "}
                  <span
                    className={`ml-1 rounded px-1.5 py-0.5 text-xs font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {filterCounts[filter]}
                  </span>
                </button>
              );
            },
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            {t("sortLabel")}
          </span>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("sortAria")}
          >
            {RESERVATION_SORTS.map(
              (sort) => {
                const isSelected = reservationSort === sort;

                return (
                  <button
                    key={sort}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setPendingCancelReservationId(null);
                      updateReservationSort(sort);
                    }}
                    className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line-strong bg-white text-slate-700 hover:border-accent hover:text-accent-strong"
                    }`}
                  >
                    {sortLabel(sort)}
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            {t("rangeLabel")}
          </span>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("rangeAria")}
          >
            {RESERVATION_RANGES.map(
              (range) => {
                const isSelected = reservationRange === range;

                return (
                  <button
                    key={range}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setPendingCancelReservationId(null);
                      updateReservationRange(range);
                    }}
                    className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line-strong bg-white text-slate-700 hover:border-accent hover:text-accent-strong"
                    }`}
                  >
                    {rangeText(range)}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </div>

      {/* 상태 chip의 count는 전체 reservations 기준이라 range 적용 후 표시 건수와
          어긋날 수 있다. range가 걸려 있고 표시 건수가 있으면 표 위에 한 줄로
          현재 보이는 건수를 명시해 오해를 줄인다. (count 자체는 그대로 둠) */}
      {reservationRange !== "all" && displayReservations.length > 0 ? (
        <p
          className="rounded-md border border-line bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600"
          role="status"
        >
          {t("rangeSummary", {
            range: rangeText(reservationRange),
            filter: filterLabel(reservationFilter),
            count: displayReservations.length,
          })}
        </p>
      ) : null}

      {recentGymEntries.length > 0 ? (
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-accent-strong">
            {t("recentGymsTitle")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t("recentGymsDesc")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recentGymEntries.map((entry) => {
              const gym = gymsById.get(entry.gymId);
              if (!gym) return null;
              return (
                <Link
                  key={entry.gymId}
                  href={`/reserve/${encodeURIComponent(entry.gymId)}?sport=${encodeURIComponent(entry.sport)}`}
                  aria-label={t("recentGymAria", {
                    name: gym.name,
                    sport: entry.sport,
                  })}
                  className="inline-flex h-9 items-center rounded-md border border-accent/30 bg-accent-tint px-3 text-xs font-semibold text-accent-strong transition hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {gym.name} · {entry.sport}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {displayReservations.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 text-center shadow-sm">
          <p className="text-base font-bold text-slate-950">
            {reservationRange !== "all"
              ? t("emptyFilterRange", {
                  range: rangeText(reservationRange),
                  filter: filterLabel(reservationFilter),
                })
              : t("emptyFilter", { filter: filterLabel(reservationFilter) })}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {reservationRange !== "all"
              ? t("emptyFilterRangeDesc")
              : reservationFilter === "all"
                ? t("emptyFilterAllDesc")
                : t("emptyFilterOtherDesc")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {reservationRange !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setPendingCancelReservationId(null);
                  updateReservationRange("all");
                }}
                aria-label={t("rangeToAllAria")}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("rangeToAll")}
              </button>
            ) : null}
            {reservationFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setPendingCancelReservationId(null);
                  updateReservationFilter("all");
                }}
                aria-label={t("filterToAllAria")}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t("filterToAll")}
              </button>
            ) : null}
            <Link
              href="/gyms"
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {t("findGym")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {displayReservations.map((reservation) => {
            const isInactive = reservation.status !== "reserved";
            const isPendingCancel =
              pendingCancelReservationId === reservation.id;
            const gymSummary = getReservationGymSummary(
              gymsById,
              reservation,
              tReservation("missingGymName"),
            );
            const gymName = gymSummary.name;
            const now = currentMinuteValue
              ? new Date(currentMinuteValue)
              : new Date();
            // 화면 행마다 동일 SSOT 함수로 detail을 재구성해 단건 상세 화면과 일관성을 맞춘다.
            // deadline은 detail.cancellation.deadline(ISO 문자열)을 Date로 환산해 사용.
            const liveDetail = createUserReservationDetail(reservation, {
              now,
            });
            const cancellationDeadline = liveDetail.cancellation.deadline
              ? (() => {
                  const parsed = new Date(liveDetail.cancellation.deadline);
                  return Number.isNaN(parsed.getTime()) ? null : parsed;
                })()
              : null;
            const cancellationMessage = liveDetail.cancellation.message;
            const canCancelReservation = liveDetail.cancellation.canCancel;

            return (
              <article
                key={reservation.id}
                className={`grid gap-5 rounded-lg border bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-[1fr_auto] ${
                  isInactive ? "border-line opacity-70" : "border-line"
                }`}
                aria-label={t("cardAria", {
                  name: gymName,
                  sport: reservation.sport,
                  status: tReservation(`status.${reservation.status}`),
                })}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
                    >
                      {tReservation(`status.${reservation.status}`)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {t("reservationNo")} {reservation.id.slice(0, 8)}
                    </span>
                    {gymSummary.isMissingFromCurrentData ? (
                      <span className="rounded-md bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
                        {t("missingGymBadge")}
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-3 break-keep text-xl font-bold text-slate-950 sm:text-2xl">
                    {gymName}
                  </h2>

                  {gymSummary.isMissingFromCurrentData ? (
                    <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                      {t("missingGymInline", { gymId: reservation.gymId })}
                    </p>
                  ) : null}

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">{t("sportLabel")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {reservation.sport}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("dateTimeLabel")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {reservation.date} {reservation.time}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("priceLabel")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatGymPrice(reservation.price)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("createdAtLabel")}</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatReservationCreatedAt(reservation.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={`/reservations/${encodeURIComponent(reservation.id)}`}
                      className="inline-flex h-10 w-full items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:w-auto"
                    >
                      {t("viewDetail")}
                    </Link>
                    {/* 시설이 현재 데이터에서 사라진 예약(isMissingFromCurrentData)은
                        실제 진입해도 예약 폼이 없으므로 "다시 예약" 버튼을 숨긴다. */}
                    {!gymSummary.isMissingFromCurrentData ? (
                      <Link
                        href={`/reserve/${encodeURIComponent(reservation.gymId)}?sport=${encodeURIComponent(reservation.sport)}&date=${encodeURIComponent(reservation.date)}&time=${encodeURIComponent(reservation.time)}`}
                        aria-label={t("rebookAria", {
                          name: gymName,
                          sport: reservation.sport,
                          date: reservation.date,
                          time: reservation.time,
                        })}
                        className="inline-flex h-10 w-full items-center justify-center rounded-md border border-accent/30 bg-accent-tint px-4 text-sm font-semibold text-accent-strong transition hover:border-accent hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:w-auto"
                      >
                        {t("rebook")}
                      </Link>
                    ) : null}
                  </div>

                  {reservation.status === "reserved" ? (
                    !canCancelReservation ? (
                      <p
                        className="mt-5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning"
                        role="status"
                      >
                        {cancellationMessage}
                      </p>
                    ) : isPendingCancel ? (
                      <div
                        className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
                        role="alert"
                      >
                        <p className="font-semibold">
                          {t("cancelConfirmTitle", { name: gymName })}
                        </p>
                        <p className="mt-1 text-xs text-error">
                          {reservation.date} {reservation.time} ·{" "}
                          {reservation.sport}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancel(reservation.id)}
                            disabled={Boolean(cancellingReservationId)}
                            aria-label={t("cancelConfirmAria", { name: gymName })}
                            className="h-10 rounded-md bg-error px-3 text-sm font-semibold text-white transition hover:bg-error/90 disabled:cursor-not-allowed disabled:bg-error/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                          >
                            {cancellingReservationId === reservation.id
                              ? t("cancelling")
                              : t("cancelConfirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingCancelReservationId(null)}
                            disabled={Boolean(cancellingReservationId)}
                            className="h-10 rounded-md border border-error/30 bg-white px-3 text-sm font-semibold text-error transition hover:bg-error/15 disabled:cursor-not-allowed disabled:text-error/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                          >
                            {t("keep")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-col items-start gap-2">
                        {cancellationDeadline ? (
                          <p className="text-xs font-semibold text-slate-500">
                            {t("cancelDeadline", {
                              deadline:
                                formatCancellationDeadline(cancellationDeadline),
                            })}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => requestCancel(reservation.id)}
                          disabled={
                            Boolean(cancellingReservationId) ||
                            !canCancelReservation
                          }
                          aria-label={t("cancelReservationAria", {
                            name: gymName,
                            date: reservation.date,
                            time: reservation.time,
                          })}
                          className="h-10 rounded-md border border-error/30 px-4 text-sm font-semibold text-error transition hover:bg-error/10 disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                        >
                          {cancellingReservationId === reservation.id
                            ? t("cancelling")
                            : t("cancelReservation")}
                        </button>
                      </div>
                    )
                  ) : null}
                </div>

                {reservation.status === "reserved" ? (
                  gymSummary.isMissingFromCurrentData ? (
                    <ReservationUnavailableTicket />
                  ) : (
                    <ReservationAdmissionTicket reservation={reservation} />
                  )
                ) : (
                  <ReservationInactiveTicket status={reservation.status} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
