"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminReservation,
  fetchAdminReservations,
  updateAdminReservationStatus,
} from "@/lib/admin/admin-reservation-client";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
import { formatGymPrice } from "@/lib/gym-utils";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { reservationStatusLabel } from "@/components/reservation-ticket";
import type { Gym, Reservation, ReservationStatus } from "@/types/domain";

type DetailState =
  | { status: "idle" }
  | { status: "loading"; reservationId: string }
  | { status: "ready"; reservation: Reservation }
  | { status: "error"; reservationId: string; message: string };

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

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

// 상태 레이블은 reservation-ticket의 SSOT(reservationStatusLabel)를 그대로 따른다.
// 관리자 필터는 "전체"만 별도 정의.
const filterLabels: Record<ReservationFilter, string> = {
  all: "전체",
  reserved: reservationStatusLabel.reserved,
  cancelled: reservationStatusLabel.cancelled,
  used: reservationStatusLabel.used,
};

// 관리자 테이블은 사용자 화면(borderless rounded-md)과 달리 의도적으로
// border 있는 pill 스타일을 쓰므로 별도 정의를 유지한다.
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
  const [detailState, setDetailState] = useState<DetailState>({
    status: "idle",
  });
  const detailAbortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);
  // 필터 변경 시점에는 abort가 트리거되지 않으므로, 응답 도착 시 현재 필터 키와
  // 비교해 stale 응답이 새 필터 화면을 덮지 않게 한다.
  const listQueryKeyRef = useRef<string>("");

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
    !actionState &&
    reservationsState.status !== "loading";

  // hydration 이후 sessionStorage의 토큰을 한 번만 읽는다.
  // 토큰 평문을 input value에 되채우지 않는다 (DOM/스냅샷 평문 노출 방지).
  // savedToken만 복원하면 조회는 그대로 동작하고, 입력란은 빈 채로 둔다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
      if (stored) {
        setSavedToken(stored);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // 현재 필터 값을 키 문자열로 보관. handleQuery에서 fetch 전 캡처해
  // 응답 도착 시 stale 여부를 비교한다.
  useEffect(() => {
    listQueryKeyRef.current = JSON.stringify({
      status: selectedStatus,
      gymId: selectedGymId,
      date: selectedDate,
      userId: userIdInput.trim(),
      limit: parsedLimit,
    });
  }, [
    selectedStatus,
    selectedGymId,
    selectedDate,
    userIdInput,
    parsedLimit,
  ]);

  const reservationMatchesCurrentFilters = useCallback(
    (reservation: Reservation) => {
      if (selectedStatus !== "all" && reservation.status !== selectedStatus) {
        return false;
      }
      if (selectedGymId && reservation.gymId !== selectedGymId) {
        return false;
      }
      if (selectedDate && reservation.date !== selectedDate) {
        return false;
      }

      const selectedUserId = userIdInput.trim();
      return !selectedUserId || reservation.userId === selectedUserId;
    },
    [selectedDate, selectedGymId, selectedStatus, userIdInput],
  );

  const updateReservationRow = useCallback(
    (reservation: Reservation) => {
      setReservationsState((prev) => {
        if (prev.status !== "ready") {
          return prev;
        }

        const shouldKeepReservation =
          reservationMatchesCurrentFilters(reservation);
        return {
          status: "ready",
          reservations: prev.reservations.flatMap((current) => {
            if (current.id !== reservation.id) {
              return [current];
            }
            return shouldKeepReservation ? [reservation] : [];
          }),
        };
      });
      // 같은 예약의 상세 패널이 열려 있다면 함께 갱신해 행과 상세 표시를 일치시킨다.
      setDetailState((prev) => {
        if (
          prev.status === "ready" &&
          prev.reservation.id === reservation.id
        ) {
          return { status: "ready", reservation };
        }
        return prev;
      });
    },
    [reservationMatchesCurrentFilters],
  );

  const handleCloseDetail = useCallback(() => {
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    setDetailState({ status: "idle" });
  }, []);

  const handleOpenDetail = useCallback(
    async (reservationId: string) => {
      if (!savedToken) {
        setDetailState({
          status: "error",
          reservationId,
          message: "관리자 토큰을 저장한 뒤 상세를 조회할 수 있습니다.",
        });
        return;
      }

      // 직전 상세 요청은 abort. 응답 도착 시점에 사용자가 다른 행을 눌렀거나
      // 닫았다면 그 응답이 현재 화면을 덮지 않게 한다.
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;

      setDetailState({ status: "loading", reservationId });

      let result;
      try {
        result = await fetchAdminReservation(
          reservationId,
          savedToken,
          controller.signal,
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        // helper가 abort 외 예외는 result로 변환하므로 여기는 사실상 도달하지 않음.
        setDetailState({
          status: "error",
          reservationId,
          message:
            error instanceof Error
              ? error.message
              : "예약 상세를 불러오지 못했습니다.",
        });
        return;
      }

      // 응답 도착 시점에 controller가 교체되었다면(다른 요청이 시작됐다면) 무시.
      if (detailAbortRef.current !== controller) {
        return;
      }
      detailAbortRef.current = null;

      if (result.ok) {
        setDetailState({ status: "ready", reservation: result.reservation });
        return;
      }

      setDetailState({
        status: "error",
        reservationId,
        message: result.message,
      });
    },
    [savedToken],
  );

  // unmount 시 진행 중 목록/상세/상태 변경 요청을 모두 abort.
  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      listAbortRef.current = null;
      detailAbortRef.current?.abort();
      detailAbortRef.current = null;
      actionAbortRef.current?.abort();
      actionAbortRef.current = null;
    };
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
    listAbortRef.current?.abort();
    listAbortRef.current = null;
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    setDetailState({ status: "idle" });
    setActionState(null);
  }, []);

  const handleQuery = useCallback(async () => {
    if (actionState) {
      return;
    }

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

    // 직전 목록 요청은 abort. 사용자가 필터를 바꾸고 다시 조회했을 때
    // 늦게 도착한 이전 응답이 현재 화면을 덮지 않도록 한다.
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    // 조회 버튼을 다시 누르지 않고 필터만 바꾼 경우엔 abort가 발동하지 않으므로,
    // requestKey로 응답 도착 시점의 필터 상태와 비교해 stale을 한 번 더 막는다.
    const requestKey = listQueryKeyRef.current;

    setReservationsState({ status: "loading" });
    setNotice(null);
    setConfirmCancelId(null);
    actionAbortRef.current?.abort();
    actionAbortRef.current = null;
    setActionState(null);
    // 목록을 새로 조회하면 이전 선택은 stale 가능성이 있으므로 상세 패널을 닫는다.
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    setDetailState({ status: "idle" });

    let result;
    try {
      result = await fetchAdminReservations(
        {
          status: selectedStatus === "all" ? undefined : selectedStatus,
          gymId: selectedGymId || undefined,
          date: selectedDate || undefined,
          userId: userIdInput.trim() || undefined,
          limit: parsedLimit,
        },
        savedToken,
        controller.signal,
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      // helper가 abort 외 예외는 result로 변환하므로 여기는 사실상 도달하지 않음.
      if (
        listAbortRef.current === controller &&
        listQueryKeyRef.current === requestKey
      ) {
        listAbortRef.current = null;
        setReservationsState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "예약 목록을 불러오지 못했습니다.",
        });
      }
      return;
    }

    // 응답 도착 시점에 controller가 교체되었거나 필터가 바뀌었다면 무시.
    if (
      listAbortRef.current !== controller ||
      listQueryKeyRef.current !== requestKey
    ) {
      return;
    }
    listAbortRef.current = null;

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
    actionState,
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

    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;

    let result;
    try {
      result = await updateAdminReservationStatus(
        reservation.id,
        nextStatus,
        savedToken,
        controller.signal,
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (actionAbortRef.current === controller) {
        actionAbortRef.current = null;
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "예약 상태를 변경하지 못했습니다.",
        });
        setActionState(null);
      }
      return;
    }

    if (actionAbortRef.current !== controller) {
      return;
    }
    actionAbortRef.current = null;

    if (result.reservation) {
      updateReservationRow(result.reservation);
    }

    setNotice({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    setActionState(null);
  };

  // 행 액션과 상세 액션이 같은 표현을 쓰도록 한 곳에서 렌더링한다.
  const renderReservationActions = (reservation: Reservation) => {
    const actionIsPending = actionState?.reservationId === reservation.id;
    const isCancelling =
      actionIsPending && actionState.nextStatus === "cancelled";
    const isMarkingUsed =
      actionIsPending && actionState.nextStatus === "used";
    const canAct =
      reservation.status === "reserved" &&
      Boolean(savedToken) &&
      !actionState;

    if (reservation.status !== "reserved") {
      return (
        <span className="text-xs font-semibold text-slate-400">
          처리 완료
        </span>
      );
    }

    if (confirmCancelId === reservation.id) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-rose-700">
            이 예약을 취소할까요?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleUpdateStatus(reservation, "cancelled")}
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
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleUpdateStatus(reservation, "used")}
          disabled={!canAct}
          className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          {isMarkingUsed ? "처리 중" : "이용 완료"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmCancelId(reservation.id)}
          disabled={!canAct}
          className="h-8 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          관리자 취소
        </button>
      </div>
    );
  };

  const selectedDetailId =
    detailState.status === "loading" ||
    detailState.status === "error"
      ? detailState.reservationId
      : detailState.status === "ready"
        ? detailState.reservation.id
        : null;

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
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              관리자 홈
            </Link>
            <Link
              href="/admin/reservation-slots"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              슬롯 관리
            </Link>
          </div>
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
              {reservationsState.status === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <AdminButtonSpinner />
                  조회 중
                </span>
              ) : (
                "조회"
              )}
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

        {detailState.status !== "idle" ? (
          <section className="rounded-lg border border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  선택된 예약 상세
                </h2>
                {detailState.status === "loading" ? (
                  <p
                    className="mt-1 flex items-center gap-2 text-xs text-slate-500"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <span
                      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
                      aria-hidden="true"
                    />
                    예약 상세를 불러오는 중입니다.
                  </p>
                ) : null}
                {detailState.status === "error" ? (
                  <p
                    className="mt-1 break-all font-mono text-xs text-slate-500"
                    aria-label="요청한 예약 ID"
                  >
                    {detailState.reservationId}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                닫기
              </button>
            </div>

            {detailState.status === "error" ? (
              <p
                className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                role="alert"
              >
                {detailState.message}
              </p>
            ) : null}

            {detailState.status === "ready" ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      예약번호
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-slate-900">
                      {detailState.reservation.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      사용자 ID
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-slate-900">
                      {detailState.reservation.userId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      시설
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {gymsById.get(detailState.reservation.gymId)?.name ??
                        "시설 정보 없음"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {detailState.reservation.gymId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      종목
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {detailState.reservation.sport}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      이용 일시
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {detailState.reservation.date}{" "}
                      {detailState.reservation.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      금액
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatGymPrice(detailState.reservation.price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      상태
                    </p>
                    <p className="mt-1">
                      <span
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${statusBadgeStyles[detailState.reservation.status]}`}
                      >
                        {reservationStatusLabel[detailState.reservation.status]}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      생성일
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {formatCreatedAt(detailState.reservation.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {renderReservationActions(detailState.reservation)}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950">예약 목록</h2>
              {reservationsState.status === "ready" ? (
                <p className="mt-1 text-xs text-slate-500">
                  {reservationStatusLabel.reserved} {statusCounts.reserved}건 ·{" "}
                  {reservationStatusLabel.used} {statusCounts.used}건 ·{" "}
                  {reservationStatusLabel.cancelled} {statusCounts.cancelled}건
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  조회하면 상태별 집계가 표시됩니다.
                </p>
              )}
            </div>
            {reservationsState.status === "ready" ? (
              <span className="text-xs font-semibold text-slate-500">
                총 {reservations.length}건
              </span>
            ) : null}
          </div>

          {reservationsState.status === "idle" ? (
            <AdminEmptyState
              title="아직 예약을 조회하지 않았습니다"
              description="상태·체육관·날짜·사용자 조건을 선택하고 조회를 누르면 예약 목록이 표시됩니다."
            />
          ) : null}

          {reservationsState.status === "loading" ? (
            <AdminLoadingRow message="예약 목록을 불러오는 중입니다." />
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
              <AdminEmptyState
                title="조건에 맞는 예약이 없습니다"
                description="다른 상태·체육관·날짜로 조건을 바꿔 다시 조회해 보세요."
              />
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
                      const isSelectedDetail =
                        selectedDetailId === reservation.id;
                      const isDetailLoading =
                        detailState.status === "loading" &&
                        detailState.reservationId === reservation.id;

                      return (
                        <tr
                          key={reservation.id}
                          className={`border-b border-slate-100 align-top ${
                            isSelectedDetail ? "bg-sky-50/60" : ""
                          }`}
                        >
                          <td className="px-3 py-3">
                            <p className="font-mono text-xs font-bold text-slate-950">
                              {getShortId(reservation.id)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatCreatedAt(reservation.createdAt)}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(reservation.id)}
                              disabled={!savedToken || isDetailLoading}
                              className="mt-2 inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                              aria-pressed={isSelectedDetail}
                            >
                              {isDetailLoading ? "여는 중" : "상세"}
                            </button>
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
                              {reservationStatusLabel[reservation.status]}
                            </span>
                          </td>
                          <td className="min-w-44 px-3 py-3">
                            {renderReservationActions(reservation)}
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
