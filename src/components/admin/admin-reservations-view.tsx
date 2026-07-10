"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminReservation,
  fetchAdminReservations,
  updateAdminReservationStatus,
} from "@/lib/admin/admin-reservation-client";
import {
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";
import { isAbortError } from "@/lib/async-error";
import { getTodayValue } from "@/lib/admin/admin-date-format";
import { AdminReservationActions } from "@/components/admin/admin-reservation-actions";
import { AdminReservationFilters } from "@/components/admin/admin-reservation-filters";
import { AdminReservationDetailPanel } from "@/components/admin/admin-reservation-detail-panel";
import { AdminReservationTable } from "@/components/admin/admin-reservation-table";
import {
  countByStatus,
  EMPTY_RESERVATIONS,
  noticeStyles,
  type ActionState,
  type DetailState,
  type Notice,
  type ReservationFilter,
  type ReservationsState,
} from "@/components/admin/admin-reservations-shared";
import type { Gym, Reservation } from "@/types/domain";

type AdminReservationsViewProps = {
  gyms: Gym[];
};

export function AdminReservationsView({ gyms }: AdminReservationsViewProps) {
  const [selectedStatus, setSelectedStatus] =
    useState<ReservationFilter>("reserved");
  const [selectedGymId, setSelectedGymId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  const [userIdInput, setUserIdInput] = useState("");
  const [limitInput, setLimitInput] = useState("100");
  // 서버 조회 결과를 다시 부르지 않고 그 위에서 빠르게 좁히기 위한 클라이언트 검색.
  // 예약번호(전체/8자리)/시설명/사용자 ID에 대해 대소문자 무시 부분 일치로 적용한다.
  const [searchInput, setSearchInput] = useState("");
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
  // 서버에서 받은 전체 결과(reservations)를 그대로 두고, 화면 표시용으로 검색어를 적용.
  // 빈 검색어이면 동일 배열을 그대로 사용해 불필요한 재계산을 피한다.
  const visibleReservations = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    if (!query) {
      return reservations;
    }
    return reservations.filter((reservation) => {
      const gymName =
        gymsById.get(reservation.gymId)?.name?.toLowerCase() ?? "";
      return (
        reservation.id.toLowerCase().includes(query) ||
        gymName.includes(query) ||
        reservation.userId.toLowerCase().includes(query)
      );
    });
  }, [gymsById, reservations, searchInput]);
  const statusCounts = useMemo(
    () => countByStatus(visibleReservations),
    [visibleReservations],
  );
  const parsedLimit = Number.parseInt(limitInput, 10);
  const isLimitValid =
    Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 200;
  const canQuery =
    isLimitValid && !actionState && reservationsState.status !== "loading";

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

  const handleOpenDetail = useCallback(async (reservationId: string) => {
    // 직전 상세 요청은 abort. 응답 도착 시점에 사용자가 다른 행을 눌렀거나
    // 닫았다면 그 응답이 현재 화면을 덮지 않게 한다.
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    setDetailState({ status: "loading", reservationId });

    let result;
    try {
      result = await fetchAdminReservation(reservationId, controller.signal);
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
  }, []);

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

  const handleQuery = useCallback(async () => {
    if (actionState) {
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
    selectedDate,
    selectedGymId,
    selectedStatus,
    userIdInput,
  ]);

  const handleUpdateStatus = async (
    reservation: Reservation,
    nextStatus: "used" | "cancelled",
  ) => {
    if (actionState) {
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

  // 행 액션과 상세 액션이 같은 표현을 쓰도록 한 컴포넌트로 렌더한다.
  // action-state 결합(actionState/confirmCancelId)은 컨테이너가 소유하고,
  // 테이블/상세 패널에는 이 렌더 함수만 내려보내 prop 표면을 좁게 유지한다.
  const renderReservationActions = (reservation: Reservation) => (
    <AdminReservationActions
      reservation={reservation}
      actionState={actionState}
      confirmCancelId={confirmCancelId}
      onMarkUsed={(target) => handleUpdateStatus(target, "used")}
      onRequestCancel={setConfirmCancelId}
      onConfirmCancel={(target) => handleUpdateStatus(target, "cancelled")}
      onKeep={() => setConfirmCancelId(null)}
    />
  );

  const selectedDetailId =
    detailState.status === "loading" || detailState.status === "error"
      ? detailState.reservationId
      : detailState.status === "ready"
        ? detailState.reservation.id
        : null;
  const detailLoadingId =
    detailState.status === "loading" ? detailState.reservationId : null;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-accent-strong">관리자</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              예약 관리
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              관리자 권한이 부여된 Firebase 계정으로 로그인한 상태에서만 동작합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              관리자 홈
            </Link>
            <Link
              href="/admin/reservation-slots"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              슬롯 관리
            </Link>
          </div>
        </header>

        <AdminReservationFilters
          gyms={gyms}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedGymId={selectedGymId}
          onGymIdChange={setSelectedGymId}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          userIdInput={userIdInput}
          onUserIdChange={setUserIdInput}
          limitInput={limitInput}
          onLimitChange={setLimitInput}
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          isLimitValid={isLimitValid}
          canQuery={canQuery}
          isLoading={reservationsState.status === "loading"}
          onQuery={handleQuery}
        />

        {notice ? (
          <div
            role="alert"
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
          >
            <p className="flex-1">{notice.message}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="알림 닫기"
              className="shrink-0 rounded-md border border-transparent px-2 py-0.5 text-xs font-semibold transition hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
            >
              닫기
            </button>
          </div>
        ) : null}

        <AdminReservationDetailPanel
          detailState={detailState}
          gymsById={gymsById}
          searchInput={searchInput}
          visibleReservations={visibleReservations}
          closeDisabled={Boolean(actionState)}
          onClose={handleCloseDetail}
          onClearSearch={() => setSearchInput("")}
          renderActions={renderReservationActions}
        />

        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
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
                {searchInput.trim()
                  ? `총 ${visibleReservations.length}건 / 조회 ${reservations.length}건`
                  : `총 ${reservations.length}건`}
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
            <AdminLoadingRow message="페이지를 불러오는 중입니다." />
          ) : null}

          {reservationsState.status === "error" ? (
            <p
              className="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm font-semibold text-error"
              role="alert"
            >
              {reservationsState.message}
            </p>
          ) : null}

          {reservationsState.status === "ready" ? (
            visibleReservations.length === 0 ? (
              <>
                <AdminEmptyState
                  title="조건에 맞는 예약이 없습니다"
                  description={
                    searchInput.trim() && reservations.length > 0
                      ? "검색어와 일치하는 예약이 없습니다. 검색어를 비우거나 다시 조회해 보세요."
                      : "다른 상태·체육관·날짜로 조건을 바꿔 다시 조회해 보세요."
                  }
                />
                {/* 검색어가 적용된 상태에서 빈 결과면 사용자가 입력 영역까지 올라가지
                    않고 바로 검색어를 풀 수 있도록 CTA를 같이 노출한다. 서버 조회
                    조건은 그대로 두고 클라이언트 검색만 비운다. */}
                {searchInput.trim() && reservations.length > 0 ? (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setSearchInput("")}
                      aria-label="검색어 지우기"
                      className="inline-flex h-9 items-center rounded-md border border-line-strong bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    >
                      검색어 지우기
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <AdminReservationTable
                reservations={visibleReservations}
                gymsById={gymsById}
                selectedDetailId={selectedDetailId}
                detailLoadingId={detailLoadingId}
                onOpenDetail={handleOpenDetail}
                renderActions={renderReservationActions}
              />
            )
          ) : null}
        </section>
      </section>
    </main>
  );
}
