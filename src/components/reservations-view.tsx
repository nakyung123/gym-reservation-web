"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useCurrentMinuteValue } from "@/hooks/use-current-minute";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  getUserReservationCancellationDeadline,
  validateUserReservationCancellation,
} from "@/lib/reservation-rules";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  formatCancellationDeadline,
  formatReservationCreatedAt,
  getReservationGymSummary,
  ReservationAdmissionTicket,
  ReservationInactiveTicket,
  reservationStatusBadgeStyles,
  reservationStatusLabel,
  ReservationUnavailableTicket,
} from "@/components/reservation-ticket";
import type { Gym, Reservation } from "@/types/domain";

const noticeStyles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

type ReservationFilter = "all" | "reserved" | "used" | "cancelled";

const reservationFilterLabels: Record<ReservationFilter, string> = {
  all: "전체",
  reserved: "예약 완료",
  used: "이용 완료",
  cancelled: "예약 취소",
};

function compareReservationsForDisplay(
  left: Reservation,
  right: Reservation,
) {
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

type ReservationsViewProps = {
  gyms: Gym[];
};

export function ReservationsView({ gyms }: ReservationsViewProps) {
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
  const [reservationFilter, setReservationFilter] =
    useState<ReservationFilter>("all");
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
  const displayReservations = useMemo(
    () =>
      reservations
        .filter((reservation) =>
          reservationFilter === "all"
            ? true
            : reservation.status === reservationFilter,
        )
        .sort(compareReservationsForDisplay),
    [reservationFilter, reservations],
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
        message: "예약 취소 중 예상하지 못한 오류가 발생했습니다.",
      });
    } finally {
      setCancellingReservationId(null);
    }
  };

  if (!reservationReadResult.ok) {
    if (reservationReadResult.reason === "not-ready") {
      return (
        <section
          className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm font-semibold text-sky-700">내 예약</p>
          <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
            예약 정보를 불러오고 있습니다
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            저장된 예약 목록을 확인하는 중입니다.
          </p>
          <div className="mt-6 flex justify-center" aria-hidden="true">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
          </div>
        </section>
      );
    }

    return (
      <section
        className="mx-auto w-full max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-8 text-center text-rose-800 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold">내 예약</p>
        <h1 className="mt-2 break-keep text-2xl font-bold sm:text-3xl">
          예약 정보를 불러오지 못했습니다
        </h1>
        <p className="mt-3 text-sm leading-6">{reservationReadResult.message}</p>
      </section>
    );
  }

  if (reservations.length === 0) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-sky-700">내 예약</p>
        <h1 className="mt-2 break-keep text-2xl font-bold text-slate-950 sm:text-3xl">
          아직 예약이 없습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          체육관 상세 화면에서 종목, 날짜, 시간을 선택하면 여기에 예약과
          모바일 입장권이 표시됩니다.
        </p>
        <Link
          href="/gyms"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          체육관 찾기
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-sky-700">내 예약</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">
              예약 {activeReservations.length}건
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              현재 세션에 연결된 예약만 표시합니다. 취소한 예약은 기록으로
              남기고 모바일 입장권은 비활성화합니다.
            </p>
          </div>
          <Link
            href="/gyms"
            className="inline-flex h-10 w-fit shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold whitespace-nowrap text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            추가 예약
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
            className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            <p className="font-semibold">
              현재 시설 목록에서 제외된 예약 {missingGymReservationCount}건이
              있습니다.
            </p>
            <p className="mt-1 leading-6">
              현재 운영 중인 시설 목록에 없는 예약입니다. 예약 기록은 유지되며
              필요하면 취소할 수 있습니다.
            </p>
          </div>
        ) : null}

        <div
          className="mt-5 flex flex-wrap gap-2"
          role="group"
          aria-label="예약 상태 필터"
        >
          {(Object.keys(reservationFilterLabels) as ReservationFilter[]).map(
            (filter) => {
              const isSelected = reservationFilter === filter;

              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setPendingCancelReservationId(null);
                    setReservationFilter(filter);
                  }}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                    isSelected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-800"
                  }`}
                >
                  {reservationFilterLabels[filter]}{" "}
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
      </div>

      {displayReservations.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-bold text-slate-950">
            {reservationFilterLabels[reservationFilter]} 내역이 없습니다
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            다른 상태를 선택하거나 체육관 상세 화면에서 새 예약을 진행할 수
            있습니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {displayReservations.map((reservation) => {
            const isInactive = reservation.status !== "reserved";
            const isPendingCancel =
              pendingCancelReservationId === reservation.id;
            const gymSummary = getReservationGymSummary(gymsById, reservation);
            const gymName = gymSummary.name;
            const now = currentMinuteValue
              ? new Date(currentMinuteValue)
              : new Date();
            const cancellationDeadline =
              reservation.status === "reserved"
                ? getUserReservationCancellationDeadline(reservation)
                : null;
            const cancellationMessage =
              reservation.status === "reserved"
                ? (() => {
                    const result = validateUserReservationCancellation({
                      reservation,
                      now,
                    });
                    return result.ok ? null : result.message;
                  })()
                : null;
            const canCancelReservation =
              reservation.status === "reserved" && cancellationMessage === null;

            return (
              <article
                key={reservation.id}
                className={`grid gap-5 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] ${
                  isInactive ? "border-slate-200 opacity-70" : "border-slate-200"
                }`}
                aria-label={`${gymName} ${reservation.sport} 예약 - ${reservationStatusLabel[reservation.status]}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${reservationStatusBadgeStyles[reservation.status]}`}
                    >
                      {reservationStatusLabel[reservation.status]}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      예약번호 {reservation.id.slice(0, 8)}
                    </span>
                    {gymSummary.isMissingFromCurrentData ? (
                      <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        시설 정보 제외됨
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-3 text-2xl font-bold text-slate-950">
                    {gymName}
                  </h2>

                  {gymSummary.isMissingFromCurrentData ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      이 예약의 체육관 ID({reservation.gymId})는 현재 운영 중인
                      시설 목록에 없습니다. 예약 기록은 유지되며 취소할 수
                      있습니다.
                    </p>
                  ) : null}

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">종목</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {reservation.sport}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">이용 일시</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {reservation.date} {reservation.time}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">금액</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatGymPrice(reservation.price)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">예약일</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatReservationCreatedAt(reservation.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/reservations/${encodeURIComponent(reservation.id)}`}
                    className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  >
                    상세 보기
                  </Link>

                  {reservation.status === "reserved" ? (
                    !canCancelReservation ? (
                      <p
                        className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
                        role="status"
                      >
                        {cancellationMessage}
                      </p>
                    ) : isPendingCancel ? (
                      <div
                        className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                        role="alert"
                      >
                        <p className="font-semibold">
                          {gymName} 예약을 취소할까요?
                        </p>
                        <p className="mt-1 text-xs text-rose-600">
                          {reservation.date} {reservation.time} ·{" "}
                          {reservation.sport}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancel(reservation.id)}
                            disabled={Boolean(cancellingReservationId)}
                            aria-label={`${gymName} 예약 취소 확정`}
                            className="h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                          >
                            {cancellingReservationId === reservation.id
                              ? "취소 중"
                              : "취소 확정"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingCancelReservationId(null)}
                            disabled={Boolean(cancellingReservationId)}
                            className="h-10 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                          >
                            유지
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-col items-start gap-2">
                        {cancellationDeadline ? (
                          <p className="text-xs font-semibold text-slate-500">
                            {formatCancellationDeadline(cancellationDeadline)}
                            까지 취소 가능
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => requestCancel(reservation.id)}
                          disabled={
                            Boolean(cancellingReservationId) ||
                            !canCancelReservation
                          }
                          aria-label={`${gymName} ${reservation.date} ${reservation.time} 예약 취소`}
                          className="h-10 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                        >
                          {cancellingReservationId === reservation.id
                            ? "취소 중"
                            : "예약 취소"}
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
