"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { formatGymPrice } from "@/lib/gym-utils";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { gyms } from "@/lib/mock-data";
import type { Reservation } from "@/types/domain";

const statusLabel: Record<Reservation["status"], string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};
const noticeStyles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

type ReservationFilter = "all" | "reserved" | "cancelled";

const reservationFilterLabels: Record<ReservationFilter, string> = {
  all: "전체",
  reserved: "예약 완료",
  cancelled: "예약 취소",
};

function getGymName(gymId: string) {
  return gyms.find((gym) => gym.id === gymId)?.name ?? "알 수 없는 체육관";
}

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

function createQrCells(seed: string) {
  return Array.from({ length: 49 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length);
    return (code + index * 7) % 3 !== 0;
  });
}

function QrPreview({ reservation }: { reservation: Reservation }) {
  const cells = createQrCells(reservation.id);

  return (
    <div
      className="grid size-32 grid-cols-7 gap-1 rounded-lg border border-slate-200 bg-white p-2"
      aria-label="모바일 입장권 QR 코드"
      role="img"
    >
      {cells.map((filled, index) => (
        <span
          key={`${reservation.id}-${index}`}
          className={`rounded-[2px] ${filled ? "bg-slate-950" : "bg-slate-100"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function AdmissionTicket({ reservation }: { reservation: Reservation }) {
  const entryCode = reservation.id.slice(0, 10).toUpperCase();

  return (
    <div className="flex flex-col items-start gap-3 lg:items-center">
      <div className="flex w-full items-center justify-between gap-3 lg:w-40">
        <p className="text-sm font-bold text-slate-950">모바일 입장권</p>
        <span
          className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"
          aria-label="입장권 상태: 활성"
        >
          활성
        </span>
      </div>
      <QrPreview reservation={reservation} />
      <div className="w-full rounded-md bg-slate-50 px-3 py-2 text-left lg:w-40 lg:text-center">
        <p className="text-xs font-semibold text-slate-500">현장 확인 코드</p>
        <p className="mt-1 font-mono text-sm font-bold tracking-wider text-slate-950">
          {entryCode}
        </p>
      </div>
    </div>
  );
}

function CancelledTicket() {
  return (
    <div
      className="flex size-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold leading-5 text-slate-400"
      aria-label="입장권 비활성화됨"
    >
      입장권
      <br />
      비활성화
    </div>
  );
}

export function ReservationsView() {
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
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
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
  const filterCounts: Record<ReservationFilter, number> = {
    all: reservations.length,
    reserved: activeReservations.length,
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
            const isCancelled = reservation.status === "cancelled";
            const isPendingCancel =
              pendingCancelReservationId === reservation.id;
            const gymName = getGymName(reservation.gymId);

            return (
              <article
                key={reservation.id}
                className={`grid gap-5 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] ${
                  isCancelled ? "border-slate-200 opacity-60" : "border-slate-200"
                }`}
                aria-label={`${gymName} ${reservation.sport} 예약 - ${statusLabel[reservation.status]}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                        isCancelled
                          ? "bg-slate-100 text-slate-500"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {statusLabel[reservation.status]}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      예약번호 {reservation.id.slice(0, 8)}
                    </span>
                  </div>

                  <h2 className="mt-3 text-2xl font-bold text-slate-950">
                    {gymName}
                  </h2>

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
                        {new Date(reservation.createdAt).toLocaleString(
                          "ko-KR",
                          { dateStyle: "short", timeStyle: "short" },
                        )}
                      </dd>
                    </div>
                  </dl>

                  {reservation.status === "reserved" ? (
                    isPendingCancel ? (
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
                      <button
                        type="button"
                        onClick={() => requestCancel(reservation.id)}
                        disabled={Boolean(cancellingReservationId)}
                        aria-label={`${gymName} ${reservation.date} ${reservation.time} 예약 취소`}
                        className="mt-5 h-10 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      >
                        {cancellingReservationId === reservation.id
                          ? "취소 중"
                          : "예약 취소"}
                      </button>
                    )
                  ) : null}
                </div>

                {reservation.status === "reserved" ? (
                  <AdmissionTicket reservation={reservation} />
                ) : (
                  <CancelledTicket />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
