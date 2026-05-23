"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminOverview,
  type AdminReservationOverview,
} from "@/lib/admin/admin-overview-client";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
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

export function AdminOverviewPanel() {
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  const [overviewState, setOverviewState] = useState<OverviewState>({
    status: "idle",
  });

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
    setOverviewState({ status: "idle" });
  }, []);

  const handleQuery = useCallback(async () => {
    if (!savedToken) {
      setOverviewState({
        status: "error",
        message: "관리자 토큰을 저장한 뒤 조회할 수 있습니다.",
      });
      return;
    }

    setOverviewState({ status: "loading" });
    const result = await fetchAdminOverview(selectedDate, savedToken);

    if (result.ok) {
      setOverviewState({ status: "ready", overview: result.overview });
      return;
    }

    setOverviewState({ status: "error", message: result.message });
  }, [savedToken, selectedDate]);

  const overview =
    overviewState.status === "ready" ? overviewState.overview : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950">운영 요약</h2>
          <p className="mt-1 text-xs text-slate-500">
            날짜별 예약 상태, 예상 매출, 관리된 슬롯 현황을 확인합니다.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[220px_160px_auto]">
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="x-admin-token 값"
            autoComplete="off"
            spellCheck={false}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          />
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveToken}
              disabled={tokenInput.trim().length === 0}
              className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              토큰 저장
            </button>
            <button
              type="button"
              onClick={handleQuery}
              disabled={!savedToken || overviewState.status === "loading"}
              className="h-10 rounded-md bg-sky-700 px-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p
          className={`text-xs font-semibold ${savedToken ? "text-emerald-700" : "text-amber-700"}`}
          role="status"
        >
          {savedToken ? "토큰이 세션에 저장되어 있습니다." : "저장된 토큰이 없습니다."}
        </p>
        <button
          type="button"
          onClick={handleForgetToken}
          disabled={!savedToken && tokenInput.length === 0}
          className="h-7 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-600 transition hover:border-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          토큰 잊기
        </button>
      </div>

      {overviewState.status === "idle" ? (
        <AdminEmptyState
          title="아직 운영 요약을 조회하지 않았습니다"
          description="관리자 토큰을 저장하고 날짜를 선택한 뒤 조회를 누르면 요약이 표시됩니다."
        />
      ) : null}

      {overviewState.status === "loading" ? (
        <AdminLoadingRow message="운영 요약을 불러오는 중입니다." />
      ) : null}

      {overviewState.status === "error" ? (
        <p
          className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
          role="alert"
        >
          {overviewState.message}
        </p>
      ) : null}

      {overview ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">
              {reservationStatusLabel.used}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {overview.reservations.used}건
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {reservationStatusLabel.cancelled} {overview.reservations.cancelled}건
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">예상 매출</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {formatGymPrice(overview.revenue.expected)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {reservationStatusLabel.used} {formatGymPrice(overview.revenue.used)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
