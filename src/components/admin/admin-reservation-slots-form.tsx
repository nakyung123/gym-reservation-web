"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchReservationSlots } from "@/lib/reservation-slot-availability";
import { updateReservationSlotPolicy } from "@/lib/admin/admin-reservation-slot-client";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
import type { Gym, ReservationSlotAvailability, Sport } from "@/types/domain";

type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; slots: ReservationSlotAvailability[] }
  | { status: "error"; message: string };

type RowDraft = { capacity: number; isClosed: boolean };

type RowSaveState =
  | { status: "saving" }
  | { status: "error"; message: string };

type AdminReservationSlotsFormProps = {
  gyms: Gym[];
};

const STATUS_LABELS: Record<ReservationSlotAvailability["status"], string> = {
  available: "예약 가능",
  full: "마감 (정원)",
  closed: "마감 (관리자)",
};

const STATUS_BADGE_STYLES: Record<
  ReservationSlotAvailability["status"],
  string
> = {
  available: "bg-emerald-50 text-emerald-800 border-emerald-200",
  full: "bg-amber-50 text-amber-800 border-amber-200",
  closed: "bg-slate-100 text-slate-700 border-slate-300",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getTodayValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function AdminReservationSlotsForm({
  gyms,
}: AdminReservationSlotsFormProps) {
  const initialGym = gyms[0] ?? null;
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [selectedGymId, setSelectedGymId] = useState<string>(
    initialGym?.id ?? "",
  );
  const [selectedSport, setSelectedSport] = useState<Sport | "">(
    initialGym?.sports[0] ?? "",
  );
  const [selectedDate, setSelectedDate] = useState<string>(getTodayValue);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });
  const [rowDrafts, setRowDrafts] = useState<Map<string, RowDraft>>(new Map());
  const [rowSaveStates, setRowSaveStates] = useState<
    Map<string, RowSaveState>
  >(new Map());

  const selectedGym = useMemo(
    () => gyms.find((gym) => gym.id === selectedGymId) ?? null,
    [gyms, selectedGymId],
  );

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

  const resetSlotState = useCallback(() => {
    setSlotsState({ status: "idle" });
    setRowDrafts(new Map());
    setRowSaveStates(new Map());
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
  }, []);

  const handleGymChange = (gymId: string) => {
    setSelectedGymId(gymId);
    const nextGym = gyms.find((gym) => gym.id === gymId) ?? null;
    setSelectedSport(nextGym?.sports[0] ?? "");
    resetSlotState();
  };

  const handleSportChange = (sport: Sport) => {
    setSelectedSport(sport);
    resetSlotState();
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    resetSlotState();
  };

  const canQuery =
    selectedGym !== null && selectedSport !== "" && selectedDate.length === 10;

  const handleQuery = useCallback(async () => {
    if (!selectedGym || !selectedSport || !selectedDate) {
      return;
    }

    setSlotsState({ status: "loading" });
    setRowSaveStates(new Map());

    const result = await fetchReservationSlots({
      gymId: selectedGym.id,
      sport: selectedSport,
      date: selectedDate,
    });

    if (result.ok) {
      setSlotsState({ status: "ready", slots: result.slots });
      setRowDrafts(
        new Map(
          result.slots.map((slot) => [
            slot.time,
            { capacity: slot.capacity, isClosed: slot.isClosed },
          ]),
        ),
      );
    } else {
      setSlotsState({ status: "error", message: result.message });
      setRowDrafts(new Map());
    }
  }, [selectedGym, selectedSport, selectedDate]);

  const handleDraftChange = (time: string, partial: Partial<RowDraft>) => {
    setRowDrafts((prev) => {
      const current = prev.get(time);
      if (!current) {
        return prev;
      }
      const next = new Map(prev);
      next.set(time, { ...current, ...partial });
      return next;
    });
    // 변경 시 행의 이전 에러 메시지를 지운다.
    setRowSaveStates((prev) => {
      if (!prev.has(time)) return prev;
      const next = new Map(prev);
      next.delete(time);
      return next;
    });
  };

  const isRowDirty = (slot: ReservationSlotAvailability): boolean => {
    const draft = rowDrafts.get(slot.time);
    if (!draft) return false;
    return (
      draft.capacity !== slot.capacity || draft.isClosed !== slot.isClosed
    );
  };

  const handleSaveRow = async (slot: ReservationSlotAvailability) => {
    if (!savedToken || !selectedGym || !selectedSport) return;
    const draft = rowDrafts.get(slot.time);
    if (!draft) return;

    setRowSaveStates((prev) => {
      const next = new Map(prev);
      next.set(slot.time, { status: "saving" });
      return next;
    });

    const result = await updateReservationSlotPolicy(
      {
        gymId: selectedGym.id,
        sport: selectedSport,
        date: selectedDate,
        time: slot.time,
        capacity: draft.capacity,
        isClosed: draft.isClosed,
      },
      savedToken,
    );

    if (result.ok) {
      setSlotsState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          status: "ready",
          slots: prev.slots.map((existing) =>
            existing.time === result.slot.time ? result.slot : existing,
          ),
        };
      });
      setRowDrafts((prev) => {
        const next = new Map(prev);
        next.set(result.slot.time, {
          capacity: result.slot.capacity,
          isClosed: result.slot.isClosed,
        });
        return next;
      });
      setRowSaveStates((prev) => {
        if (!prev.has(slot.time)) return prev;
        const next = new Map(prev);
        next.delete(slot.time);
        return next;
      });
    } else {
      setRowSaveStates((prev) => {
        const next = new Map(prev);
        next.set(slot.time, { status: "error", message: result.message });
        return next;
      });
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">관리자</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              슬롯 관리
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              체육관·종목·날짜를 선택해 시간대별 정원과 마감 여부를 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              관리자 홈
            </Link>
            <Link
              href="/admin/reservations"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              예약 관리
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">관리자 토큰</h2>
          <p className="mt-1 text-xs text-slate-500">
            토큰은 이 브라우저 세션의 sessionStorage에만 저장됩니다. 새 탭이나
            창을 닫으면 사라집니다.
          </p>
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
              ? "토큰이 세션에 저장되어 PATCH 요청에 사용됩니다."
              : "저장된 토큰이 없습니다. 변경 저장 전에 토큰을 입력하세요."}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">조회 조건</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              체육관
              <select
                value={selectedGymId}
                onChange={(event) => handleGymChange(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {gyms.length === 0 ? (
                  <option value="">체육관이 없습니다</option>
                ) : (
                  gyms.map((gym) => (
                    <option key={gym.id} value={gym.id}>
                      {gym.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              종목
              <select
                value={selectedSport}
                onChange={(event) =>
                  handleSportChange(event.target.value as Sport)
                }
                disabled={!selectedGym}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {selectedGym ? (
                  selectedGym.sports.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))
                ) : (
                  <option value="">종목 없음</option>
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              날짜
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => handleDateChange(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </label>
            <button
              type="button"
              onClick={handleQuery}
              disabled={!canQuery || slotsState.status === "loading"}
              className="h-10 self-end rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              {slotsState.status === "loading" ? "조회 중" : "조회"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">시간대 슬롯</h2>

          {slotsState.status === "idle" ? (
            <p className="mt-3 text-sm text-slate-500">
              조건을 선택하고 조회를 눌러주세요.
            </p>
          ) : null}

          {slotsState.status === "loading" ? (
            <p className="mt-3 text-sm text-slate-500">
              슬롯 정보를 불러오는 중입니다.
            </p>
          ) : null}

          {slotsState.status === "error" ? (
            <p
              className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
              role="alert"
            >
              {slotsState.message}
            </p>
          ) : null}

          {slotsState.status === "ready" ? (
            slotsState.slots.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                해당 조건에 등록된 시간대가 없습니다.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        시간
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        정원
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        마감
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        예약 / 잔여
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        상태
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        저장
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotsState.slots.map((slot) => {
                      const draft = rowDrafts.get(slot.time) ?? {
                        capacity: slot.capacity,
                        isClosed: slot.isClosed,
                      };
                      const dirty = isRowDirty(slot);
                      const saveState = rowSaveStates.get(slot.time);
                      const isSaving = saveState?.status === "saving";
                      const saveError =
                        saveState?.status === "error"
                          ? saveState.message
                          : null;
                      const canSave =
                        Boolean(savedToken) && dirty && !isSaving;

                      return (
                        <tr
                          key={slot.time}
                          className="border-b border-slate-100 align-top"
                        >
                          <td className="px-3 py-3 font-semibold text-slate-900">
                            {slot.time}
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min={1}
                              max={999}
                              step={1}
                              value={draft.capacity}
                              onChange={(event) => {
                                const parsed = Number.parseInt(
                                  event.target.value,
                                  10,
                                );
                                if (!Number.isFinite(parsed)) return;
                                handleDraftChange(slot.time, {
                                  capacity: parsed,
                                });
                              }}
                              className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={draft.isClosed}
                                onChange={(event) =>
                                  handleDraftChange(slot.time, {
                                    isClosed: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              마감
                            </label>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {slot.reservedCount}명 / 잔여 {slot.remaining}명
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${STATUS_BADGE_STYLES[slot.status]}`}
                            >
                              {STATUS_LABELS[slot.status]}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveRow(slot)}
                                disabled={!canSave}
                                className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                              >
                                {isSaving
                                  ? "저장 중"
                                  : dirty
                                    ? "저장"
                                    : "변경 없음"}
                              </button>
                              {saveError ? (
                                <p
                                  className="text-xs font-semibold text-rose-700"
                                  role="alert"
                                >
                                  {saveError}
                                </p>
                              ) : null}
                            </div>
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
