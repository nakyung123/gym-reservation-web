"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminReservations,
  updateAdminReservationStatus,
} from "@/lib/admin/admin-reservation-client";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
import { formatGymPrice } from "@/lib/gym-utils";
import type { Gym, Reservation, ReservationStatus } from "@/types/domain";

type AdminReservationsViewProps = {
  gyms: Gym[];
};

type ReservationFilter = ReservationStatus | "all";

type ReservationsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; reservations: Reservation[] }
  | { status: "error"; message: string };

type Notice = {
  tone: "success" | "error";
  message: string;
};

type ActionState = {
  reservationId: string;
  nextStatus: "used" | "cancelled";
};

const statusLabels: Record<ReservationStatus, string> = {
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};

const filterLabels: Record<ReservationFilter, string> = {
  all: "전체",
  reserved: "예약 완료",
  cancelled: "예약 취소",
  used: "이용 완료",
};

const statusBadgeStyles: Record<ReservationStatus, string> = {
  reserved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  used: "border-sky-200 bg-sky-50 text-sky-800",
};

const noticeStyles: Record<Notice["tone"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

const EMPTY_RESERVATIONS: Reservation[] = [];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getTodayValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getShortId(value: string) {
  return value.slice(0, 8);
}

function countByStatus(reservations: Reservation[]) {
  return reservations.reduce(
    (counts, reservation) => ({
      ...counts,
      [reservation.status]: counts[reservation.status] + 1,
    }),
    {
      reserved: 0,
      cancelled: 0,
      used: 0,
    } satisfies Record<ReservationStatus, number>,
  );
}

export function AdminReservationsView({ gyms }: AdminReservationsViewProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<ReservationFilter>("reserved");
  const [selectedGymId, setSelectedGymId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  const [userIdInput, setUserIdInput] = useState("");
  const [limitInput, setLimitInput] = useState("100");
  const [reservationsState, setReservationsState] =
    useState<ReservationsState>({ status: "idle" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const gymsById = useMemo(
    () => new Map(gyms.map((gym) => [gym.id, gym])),
    [gyms],
  );
  const reservations =
    reservationsState.status === "ready"
      ? reservationsState.reservations
      : EMPTY_RESERVATIONS;
  const statusCounts = useMemo(() => countByStatus(reservations), [reservations]);
  const parsedLimit = Number.parseInt(limitInput, 10);
  const isLimitValid =
    Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 200;
  const canQuery =
    Boolean(savedToken) &&
    isLimitValid &&
    reservationsState.status !== "loading";

  // hydration 이후 sessionStorage의 토큰을 한 번만 읽는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
      if (stored) {
        setSavedToken(stored);
        setTokenInput(stored);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const updateReservationRow = useCallback((reservation: Reservation) => {
    setReservationsState((prev) => {
      if (prev.status !== "ready") {
        return prev;
      }
      return {
        status: "ready",
        reservations: prev.reservations.map((current) =>
          current.id === reservation.id ? reservation : current,
        ),
      };
    });
  }, []);

  const handleSaveToken = useCallback(() => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      return;
    }
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
    setSavedToken(trimmed);
  }, [tokenInput]);

  const handleForgetToken = useCallback(() => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setSavedToken(null);
    setTokenInput("");
    setReservationsState({ status: "idle" });
    setNotice(null);
    setConfirmCancelId(null);
  }, []);

  const handleQuery = useCallback(async () => {
    if (!savedToken) {
      setReservationsState({
        status: "error",
        message: "관리자 토큰을 저장한 뒤 조회할 수 있습니다.",
      });
      return;
    }

    if (!isLimitValid) {
      setReservationsState({
        status: "error",
        message: "limit은 1 이상 200 이하의 정수여야 합니다.",
      });
      return;
    }

    setReservationsState({ status: "loading" });
    setNotice(null);
    setConfirmCancelId(null);

    const result = await fetchAdminReservations(
      {
        status: selectedStatus === "all" ? undefined : selectedStatus,
        gymId: selectedGymId || undefined,
        date: selectedDate || undefined,
        userId: userIdInput.trim() || undefined,
        limit: parsedLimit,
      },
      savedToken,
    );

    if (result.ok) {
      setReservationsState({
        status: "ready",
        reservations: result.reservations,
      });
      return;
    }

    setReservationsState({ status: "error", message: result.message });
  }, [
    isLimitValid,
    parsedLimit,
    savedToken,
    selectedDate,
    selectedGymId,
    selectedStatus,
    userIdInput,
  ]);

  const handleUpdateStatus = async (
    reservation: Reservation,
    nextStatus: "used" | "cancelled",
  ) => {
    if (!savedToken || actionState) {
      return;
    }

    setActionState({ reservationId: reservation.id, nextStatus });
    setNotice(null);
    setConfirmCancelId(null);

    const result = await updateAdminReservationStatus(
      reservation.id,
      nextStatus,
      savedToken,
    );

    if (result.reservation) {
      updateReservationRow(result.reservation);
    }

    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    setActionState(null);
  };

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">관리자</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              예약 관리
            </h1>
          </div>
          <Link
            href="/admin/reservation-slots"
            className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            슬롯 관리
          </Link>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">관리자 토큰</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="x-admin-token 값"
              autoComplete="off"
              spellCheck={false}
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={tokenInput.trim().length === 0}
                className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                토큰 저장
              </button>
              <button
                type="button"
                onClick={handleForgetToken}
                disabled={!savedToken && tokenInput.length === 0}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
              >
                토큰 잊기
              </button>
            </div>
          </div>
          <p
            className={`mt-2 text-xs font-semibold ${savedToken ? "text-emerald-700" : "text-amber-700"}`}
            role="status"
          >
            {savedToken
              ? "토큰이 세션에 저장되어 관리자 요청에 사용됩니다."
              : "저장된 토큰이 없습니다."}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">조회 조건</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1.3fr_90px_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              상태
              <select
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(event.target.value as ReservationFilter)
                }
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {(Object.keys(filterLabels) as ReservationFilter[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {filterLabels[status]}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              체육관
              <select
                value={selectedGymId}
                onChange={(event) => setSelectedGymId(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <option value="">전체</option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              날짜
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              사용자 ID
              <input
                type="text"
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
                placeholder="전체"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              limit
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </label>

            <button
              type="button"
              onClick={handleQuery}
              disabled={!canQuery}
              className="h-10 self-end rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              {reservationsState.status === "loading" ? "조회 중" : "조회"}
            </button>
          </div>
          {!isLimitValid ? (
            <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">
              limit은 1 이상 200 이하의 정수여야 합니다.
            </p>
          ) : null}
        </section>

        {notice ? (
          <div
            role="alert"
            className={`rounded-lg border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
          >
            {notice.message}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950">예약 목록</h2>
              <p className="mt-1 text-xs text-slate-500">
                예약 완료 {statusCounts.reserved}건 · 이용 완료{" "}
                {statusCounts.used}건 · 예약 취소 {statusCounts.cancelled}건
              </p>
            </div>
            {reservationsState.status === "ready" ? (
              <span className="text-xs font-semibold text-slate-500">
                총 {reservations.length}건
              </span>
            ) : null}
          </div>

          {reservationsState.status === "idle" ? (
            <p className="mt-4 text-sm text-slate-500">
              조건을 선택하고 조회를 눌러주세요.
            </p>
          ) : null}

          {reservationsState.status === "loading" ? (
            <p className="mt-4 text-sm text-slate-500">
              예약 목록을 불러오는 중입니다.
            </p>
          ) : null}

          {reservationsState.status === "error" ? (
            <p
              className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
              role="alert"
            >
              {reservationsState.message}
            </p>
          ) : null}

          {reservationsState.status === "ready" ? (
            reservations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                조건에 맞는 예약이 없습니다.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        예약
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        시설
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        이용 일시
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        사용자
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        결제
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        상태
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        처리
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation) => {
                      const gym = gymsById.get(reservation.gymId);
                      const actionIsPending =
                        actionState?.reservationId === reservation.id;
                      const isCancelling =
                        actionIsPending &&
                        actionState.nextStatus === "cancelled";
                      const isMarkingUsed =
                        actionIsPending && actionState.nextStatus === "used";
                      const canAct =
                        reservation.status === "reserved" &&
                        Boolean(savedToken) &&
                        !actionState;

                      return (
                        <tr
                          key={reservation.id}
                          className="border-b border-slate-100 align-top"
                        >
                          <td className="px-3 py-3">
                            <p className="font-mono text-xs font-bold text-slate-950">
                              {getShortId(reservation.id)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatCreatedAt(reservation.createdAt)}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-950">
                              {gym?.name ?? "시설 정보 없음"}
                            </p>
                            <p className="mt-1 font-mono text-xs text-slate-400">
                              {reservation.gymId}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-950">
                              {reservation.date} {reservation.time}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {reservation.sport}
                            </p>
                          </td>
                          <td className="max-w-52 px-3 py-3">
                            <p className="break-all font-mono text-xs text-slate-700">
                              {reservation.userId}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-950">
                            {formatGymPrice(reservation.price)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${statusBadgeStyles[reservation.status]}`}
                            >
                              {statusLabels[reservation.status]}
                            </span>
                          </td>
                          <td className="min-w-44 px-3 py-3">
                            {reservation.status === "reserved" ? (
                              confirmCancelId === reservation.id ? (
                                <div className="flex flex-col gap-2">
                                  <p className="text-xs font-semibold text-rose-700">
                                    이 예약을 취소할까요?
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateStatus(
                                          reservation,
                                          "cancelled",
                                        )
                                      }
                                      disabled={!canAct}
                                      className="h-8 rounded-md bg-rose-700 px-3 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                                    >
                                      {isCancelling ? "취소 중" : "취소 확정"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(null)}
                                      disabled={Boolean(actionState)}
                                      className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                                    >
                                      유지
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateStatus(reservation, "used")
                                    }
                                    disabled={!canAct}
                                    className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                                  >
                                    {isMarkingUsed ? "처리 중" : "이용 완료"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmCancelId(reservation.id)
                                    }
                                    disabled={!canAct}
                                    className="h-8 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                                  >
                                    관리자 취소
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">
                                처리 완료
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>
      </section>
    </main>
  );
}
