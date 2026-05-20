"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReservationSlots } from "@/lib/reservation-slot-availability";
import {
  bulkUpdateReservationSlotPolicy,
  updateReservationSlotPolicy,
  type AdminBulkUpdateSlotInput,
} from "@/lib/admin/admin-reservation-slot-client";
import {
  ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT,
  addAdminBulkSlotDate,
  getAdminBulkSlotTargetCount,
  isAdminBulkSlotDateValue,
  isAdminBulkSlotTargetOverLimit,
  normalizeAdminBulkSlotDates,
} from "@/lib/admin/admin-reservation-slot-policy";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import type { Gym, ReservationSlotAvailability, Sport } from "@/types/domain";

const BULK_DEFAULT_CAPACITY = 10;
const BULK_MIN_CAPACITY = 1;
const BULK_MAX_CAPACITY = 999;

type BulkClosedMode = "none" | "close" | "open";

type BulkSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; updatedCount: number }
  | { status: "error"; message: string }
  | {
      status: "conflict";
      message: string;
      conflicts: ReservationSlotAvailability[];
    };

type SlotsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; slots: ReservationSlotAvailability[] }
  | { status: "error"; message: string };

type RowDraft = { capacity: number; isClosed: boolean };

type RowSaveState =
  | { status: "saving" }
  | { status: "error"; message: string };

type BulkDateNotice = { tone: "error" | "info"; message: string };

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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isValidCapacity(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= BULK_MIN_CAPACITY &&
    value <= BULK_MAX_CAPACITY
  );
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
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set());
  const [bulkAdditionalDates, setBulkAdditionalDates] = useState<string[]>([]);
  const [bulkDateInput, setBulkDateInput] = useState("");
  const [bulkDateNotice, setBulkDateNotice] =
    useState<BulkDateNotice | null>(null);
  const [bulkCapacityEnabled, setBulkCapacityEnabled] = useState(false);
  const [bulkCapacity, setBulkCapacity] = useState<number>(
    BULK_DEFAULT_CAPACITY,
  );
  const [bulkClosedMode, setBulkClosedMode] = useState<BulkClosedMode>("none");
  const [bulkSaveState, setBulkSaveState] = useState<BulkSaveState>({
    status: "idle",
  });

  const selectedGym = useMemo(
    () => gyms.find((gym) => gym.id === selectedGymId) ?? null,
    [gyms, selectedGymId],
  );
  const hasRowSaving = useMemo(
    () =>
      [...rowSaveStates.values()].some((state) => state.status === "saving"),
    [rowSaveStates],
  );
  const isSavingSlotChange =
    hasRowSaving || bulkSaveState.status === "saving";

  // 비동기 응답이 도착했을 때 사용자가 이미 조회 조건을 바꿨는지 판정하기 위한 키.
  // 커밋 이후 useEffect에서 최신값으로 갱신해, 응답 처리 시점에 ref로 비교한다.
  const queryKeyRef = useRef<string>("");
  const queryAbortRef = useRef<AbortController | null>(null);
  const rowSaveAbortRefs = useRef<Map<string, AbortController>>(new Map());
  const bulkAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    queryKeyRef.current = `${selectedGymId}|${selectedSport}|${selectedDate}`;
  }, [selectedGymId, selectedSport, selectedDate]);

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

  const abortRowSaveRequests = useCallback(() => {
    for (const controller of rowSaveAbortRefs.current.values()) {
      controller.abort();
    }
    rowSaveAbortRefs.current.clear();
  }, []);

  const abortSlotRequests = useCallback(() => {
    queryAbortRef.current?.abort();
    queryAbortRef.current = null;
    abortRowSaveRequests();
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = null;
  }, [abortRowSaveRequests]);

  const resetSlotState = useCallback(() => {
    abortSlotRequests();
    setSlotsState({ status: "idle" });
    setRowDrafts(new Map());
    setRowSaveStates(new Map());
    setSelectedTimes(new Set());
    setBulkAdditionalDates([]);
    setBulkDateInput("");
    setBulkDateNotice(null);
    setBulkSaveState({ status: "idle" });
  }, [abortSlotRequests]);

  useEffect(() => {
    return () => {
      abortSlotRequests();
    };
  }, [abortSlotRequests]);

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
    resetSlotState();
  }, [resetSlotState]);

  const handleGymChange = (gymId: string) => {
    if (isSavingSlotChange) return;
    setSelectedGymId(gymId);
    const nextGym = gyms.find((gym) => gym.id === gymId) ?? null;
    setSelectedSport(nextGym?.sports[0] ?? "");
    resetSlotState();
  };

  const handleSportChange = (sport: Sport) => {
    if (isSavingSlotChange) return;
    setSelectedSport(sport);
    resetSlotState();
  };

  const handleDateChange = (date: string) => {
    if (isSavingSlotChange) return;
    setSelectedDate(date);
    resetSlotState();
  };

  const canQuery =
    selectedGym !== null &&
    selectedSport !== "" &&
    selectedDate.length === 10 &&
    !isSavingSlotChange;

  const handleQuery = useCallback(async () => {
    if (isSavingSlotChange) {
      return;
    }

    if (!selectedGym || !selectedSport || !selectedDate) {
      return;
    }

    // 응답 도착 시점에 체육관/종목/날짜가 바뀌었다면 이전 응답을 새 화면에 덮어쓰지 않는다.
    const requestKey = queryKeyRef.current;
    abortSlotRequests();
    const controller = new AbortController();
    queryAbortRef.current = controller;

    setSlotsState({ status: "loading" });
    setRowSaveStates(new Map());
    setSelectedTimes(new Set());
    setBulkSaveState({ status: "idle" });

    let result;
    try {
      result = await fetchReservationSlots({
        gymId: selectedGym.id,
        sport: selectedSport,
        date: selectedDate,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (
        queryAbortRef.current === controller &&
        queryKeyRef.current === requestKey
      ) {
        queryAbortRef.current = null;
        setSlotsState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "슬롯 정보를 불러오지 못했습니다.",
        });
      }
      return;
    }

    if (
      queryAbortRef.current !== controller ||
      queryKeyRef.current !== requestKey
    ) {
      return;
    }
    queryAbortRef.current = null;

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
  }, [
    abortSlotRequests,
    isSavingSlotChange,
    selectedGym,
    selectedSport,
    selectedDate,
  ]);

  const handleDraftChange = (time: string, partial: Partial<RowDraft>) => {
    if (isSavingSlotChange) return;
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
    if (isSavingSlotChange) return;
    if (bulkAbortRef.current || rowSaveAbortRefs.current.size > 0) return;
    if (!savedToken || !selectedGym || !selectedSport) return;
    const draft = rowDrafts.get(slot.time);
    if (!draft) return;
    if (!isValidCapacity(draft.capacity)) {
      setRowSaveStates((prev) => {
        const next = new Map(prev);
        next.set(slot.time, {
          status: "error",
          message: "정원은 1명 이상 999명 이하의 정수여야 합니다.",
        });
        return next;
      });
      return;
    }

    const requestKey = `${selectedGym.id}|${selectedSport}|${selectedDate}`;
    rowSaveAbortRefs.current.get(slot.time)?.abort();
    const controller = new AbortController();
    rowSaveAbortRefs.current.set(slot.time, controller);

    setRowSaveStates((prev) => {
      const next = new Map(prev);
      next.set(slot.time, { status: "saving" });
      return next;
    });

    let result;
    try {
      result = await updateReservationSlotPolicy(
        {
          gymId: selectedGym.id,
          sport: selectedSport,
          date: selectedDate,
          time: slot.time,
          capacity: draft.capacity,
          isClosed: draft.isClosed,
        },
        savedToken,
        controller.signal,
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (rowSaveAbortRefs.current.get(slot.time) === controller) {
        rowSaveAbortRefs.current.delete(slot.time);
        setRowSaveStates((prev) => {
          const next = new Map(prev);
          next.set(slot.time, {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "슬롯 정책을 저장하지 못했습니다.",
          });
          return next;
        });
      }
      return;
    }

    // 응답이 도착한 시점에 조회 조건이 바뀌었다면 새 테이블에 옛 응답을 섞지 않는다.
    // resetSlotState가 rowSaveStates를 이미 비웠으므로 추가 정리는 불필요.
    if (
      rowSaveAbortRefs.current.get(slot.time) !== controller ||
      queryKeyRef.current !== requestKey
    ) {
      return;
    }
    rowSaveAbortRefs.current.delete(slot.time);

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

  const handleToggleRow = (time: string, checked: boolean) => {
    if (isSavingSlotChange) return;
    setSelectedTimes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(time);
      } else {
        next.delete(time);
      }
      return next;
    });
    // 선택 변경 시 이전 일괄 결과 메시지는 흐림.
    setBulkSaveState((prev) =>
      prev.status === "idle" || prev.status === "saving"
        ? prev
        : { status: "idle" },
    );
  };

  const handleToggleAll = (checked: boolean) => {
    if (isSavingSlotChange) return;
    if (slotsState.status !== "ready") return;
    setSelectedTimes(
      checked ? new Set(slotsState.slots.map((slot) => slot.time)) : new Set(),
    );
    setBulkSaveState((prev) =>
      prev.status === "idle" || prev.status === "saving"
        ? prev
        : { status: "idle" },
    );
  };

  const bulkTargetDates = useMemo(
    () => normalizeAdminBulkSlotDates([selectedDate, ...bulkAdditionalDates]),
    [selectedDate, bulkAdditionalDates],
  );
  const hasInvalidBulkTargetDate = !bulkTargetDates.every(
    isAdminBulkSlotDateValue,
  );
  const bulkTargetCount = getAdminBulkSlotTargetCount({
    dateCount: bulkTargetDates.length,
    timeCount: selectedTimes.size,
  });

  const handleAddBulkDate = () => {
    if (isSavingSlotChange) return;

    const nextDate = bulkDateInput.trim();
    const result = addAdminBulkSlotDate(bulkTargetDates, nextDate);
    if (!result.ok) {
      setBulkDateNotice({ tone: "error", message: result.message });
      return;
    }

    setBulkAdditionalDates(
      result.dates.filter((date) => date !== selectedDate),
    );
    setBulkDateInput("");
    setBulkDateNotice({
      tone: "info",
      message: `${nextDate} 날짜가 추가되었습니다.`,
    });
    setBulkSaveState((prev) =>
      prev.status === "idle" || prev.status === "saving"
        ? prev
        : { status: "idle" },
    );
  };

  const handleRemoveBulkDate = (date: string) => {
    if (isSavingSlotChange) return;
    setBulkAdditionalDates((prev) => prev.filter((item) => item !== date));
    setBulkDateNotice(null);
    setBulkSaveState((prev) =>
      prev.status === "idle" || prev.status === "saving"
        ? prev
        : { status: "idle" },
    );
  };

  const isAllSelected =
    slotsState.status === "ready" &&
    slotsState.slots.length > 0 &&
    slotsState.slots.every((slot) => selectedTimes.has(slot.time));

  const hasBulkChange = bulkCapacityEnabled || bulkClosedMode !== "none";

  const isBulkCapacityValid =
    !bulkCapacityEnabled || isValidCapacity(bulkCapacity);

  const isOverBulkLimit = isAdminBulkSlotTargetOverLimit({
    dateCount: bulkTargetDates.length,
    timeCount: selectedTimes.size,
  });

  const canBulkApply =
    Boolean(savedToken) &&
    selectedTimes.size > 0 &&
    bulkTargetDates.length > 0 &&
    !hasInvalidBulkTargetDate &&
    !isOverBulkLimit &&
    isBulkCapacityValid &&
    hasBulkChange &&
    !hasRowSaving &&
    bulkSaveState.status !== "saving";

  const handleBulkApply = async () => {
    if (!savedToken || !selectedGym || !selectedSport) return;
    if (bulkAbortRef.current || rowSaveAbortRefs.current.size > 0) return;
    if (
      selectedTimes.size === 0 ||
      bulkTargetDates.length === 0 ||
      hasInvalidBulkTargetDate ||
      isOverBulkLimit ||
      !isBulkCapacityValid ||
      hasRowSaving ||
      !hasBulkChange
    ) {
      return;
    }

    const input: AdminBulkUpdateSlotInput = {
      gymId: selectedGym.id,
      sport: selectedSport,
      dates: bulkTargetDates,
      times: [...selectedTimes],
    };
    if (bulkCapacityEnabled) {
      input.capacity = bulkCapacity;
    }
    if (bulkClosedMode === "close") {
      input.isClosed = true;
    } else if (bulkClosedMode === "open") {
      input.isClosed = false;
    }

    const requestKey = `${selectedGym.id}|${selectedSport}|${selectedDate}`;
    abortRowSaveRequests();
    const controller = new AbortController();
    bulkAbortRef.current = controller;

    setBulkSaveState({ status: "saving" });
    setRowSaveStates(new Map());

    let result;
    try {
      result = await bulkUpdateReservationSlotPolicy(
        input,
        savedToken,
        controller.signal,
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (
        bulkAbortRef.current === controller &&
        queryKeyRef.current === requestKey
      ) {
        bulkAbortRef.current = null;
        setBulkSaveState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "슬롯 일괄 변경을 적용하지 못했습니다.",
        });
      }
      return;
    }

    // 응답 도착 시점에 조회 조건이 바뀌었다면 새 테이블에 이전 응답을 섞지 않는다.
    // resetSlotState가 bulkSaveState를 이미 idle로 만들었으므로 추가 정리는 불필요.
    if (
      bulkAbortRef.current !== controller ||
      queryKeyRef.current !== requestKey
    ) {
      return;
    }
    bulkAbortRef.current = null;

    if (result.ok) {
      // 응답에 다른 날짜가 섞여 와도 현재 조회 날짜만 반영.
      const relevant = result.slots.filter(
        (slot) => slot.date === selectedDate,
      );
      const updatedByTime = new Map(
        relevant.map((slot) => [slot.time, slot] as const),
      );

      setSlotsState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          status: "ready",
          slots: prev.slots.map(
            (existing) => updatedByTime.get(existing.time) ?? existing,
          ),
        };
      });
      setRowDrafts((prev) => {
        const next = new Map(prev);
        for (const updated of relevant) {
          next.set(updated.time, {
            capacity: updated.capacity,
            isClosed: updated.isClosed,
          });
        }
        return next;
      });
      setRowSaveStates((prev) => {
        if (relevant.length === 0) return prev;
        const next = new Map(prev);
        for (const updated of relevant) {
          next.delete(updated.time);
        }
        return next;
      });
      setSelectedTimes(new Set());
      setBulkSaveState({
        status: "success",
        updatedCount: result.updatedCount,
      });
      return;
    }

    if (result.kind === "conflict") {
      setBulkSaveState({
        status: "conflict",
        message: result.message,
        conflicts: result.conflicts,
      });
      return;
    }

    setBulkSaveState({ status: "error", message: result.message });
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
              disabled={isSavingSlotChange}
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={tokenInput.trim().length === 0 || isSavingSlotChange}
                className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                토큰 저장
              </button>
              <button
                type="button"
                onClick={handleForgetToken}
                disabled={
                  (!savedToken && tokenInput.length === 0) || isSavingSlotChange
                }
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
                disabled={isSavingSlotChange}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
                disabled={!selectedGym || isSavingSlotChange}
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
                disabled={isSavingSlotChange}
                className="h-10 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
            </label>
            <button
              type="button"
              onClick={handleQuery}
              disabled={!canQuery || slotsState.status === "loading"}
              className="h-10 self-end rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              {slotsState.status === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <AdminButtonSpinner />
                  조회 중
                </span>
              ) : (
                "조회"
              )}
            </button>
          </div>
          {isSavingSlotChange ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              저장이 끝난 뒤 조회 조건을 변경할 수 있습니다.
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">시간대 슬롯</h2>

          {slotsState.status === "idle" ? (
            <AdminEmptyState
              title="아직 슬롯을 조회하지 않았습니다"
              description="체육관·종목·날짜를 선택하고 조회를 누르면 시간대별 슬롯이 표시됩니다."
            />
          ) : null}

          {slotsState.status === "loading" ? (
            <AdminLoadingRow message="슬롯 정보를 불러오는 중입니다." />
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
              <AdminEmptyState
                title="등록된 시간대가 없습니다"
                description="선택한 체육관·종목·날짜에는 관리 가능한 시간대 슬롯이 없습니다."
              />
            ) : (
              <>
                <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/40 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      일괄 적용
                    </p>
                    <p className="text-xs font-semibold text-slate-600">
                      선택된 시간 {selectedTimes.size}개
                      {selectedTimes.size > 0
                        ? ` · 적용 날짜 ${bulkTargetDates.length}개 · 대상 ${bulkTargetCount}건`
                        : ""}
                    </p>
                  </div>
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                        추가 날짜
                        <input
                          type="date"
                          value={bulkDateInput}
                          onChange={(event) => {
                            setBulkDateInput(event.target.value);
                            setBulkDateNotice(null);
                          }}
                          disabled={isSavingSlotChange}
                          className="h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddBulkDate}
                        disabled={isSavingSlotChange}
                        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                      >
                        날짜 추가
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex h-7 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">
                        조회 날짜 {selectedDate}
                      </span>
                      {bulkAdditionalDates.map((date) => (
                        <span
                          key={date}
                          className="inline-flex h-7 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                        >
                          {date}
                          <button
                            type="button"
                            onClick={() => handleRemoveBulkDate(date)}
                            disabled={isSavingSlotChange}
                            aria-label={`${date} 적용 날짜 제거`}
                            className="rounded text-slate-500 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {bulkDateNotice ? (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          bulkDateNotice.tone === "error"
                            ? "text-rose-700"
                            : "text-emerald-700"
                        }`}
                        role={
                          bulkDateNotice.tone === "error" ? "alert" : "status"
                        }
                      >
                        {bulkDateNotice.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={bulkCapacityEnabled}
                          onChange={(event) =>
                            setBulkCapacityEnabled(event.target.checked)
                          }
                          disabled={isSavingSlotChange}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        정원 변경
                      </label>
                      <input
                        type="number"
                        min={BULK_MIN_CAPACITY}
                        max={BULK_MAX_CAPACITY}
                        step={1}
                        value={bulkCapacity}
                        onChange={(event) => {
                          const parsed = Number.parseInt(
                            event.target.value,
                            10,
                          );
                          if (!Number.isFinite(parsed)) return;
                          setBulkCapacity(parsed);
                        }}
                        disabled={!bulkCapacityEnabled || isSavingSlotChange}
                        className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      />
                    </div>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                      마감
                      <select
                        value={bulkClosedMode}
                        onChange={(event) =>
                          setBulkClosedMode(
                            event.target.value as BulkClosedMode,
                          )
                        }
                        disabled={isSavingSlotChange}
                        className="h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <option value="none">변경 안 함</option>
                        <option value="close">마감 적용</option>
                        <option value="open">마감 해제</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={handleBulkApply}
                      disabled={!canBulkApply}
                      className="h-9 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    >
                      {bulkSaveState.status === "saving" ? (
                        <span className="inline-flex items-center gap-2">
                          <AdminButtonSpinner />
                          적용 중
                        </span>
                      ) : (
                        "일괄 적용"
                      )}
                    </button>
                  </div>
                  {!savedToken ? (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      관리자 토큰을 먼저 저장해주세요.
                    </p>
                  ) : null}
                  {selectedTimes.size === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      아래 표에서 일괄 적용할 시간을 선택하세요.
                    </p>
                  ) : null}
                  {!hasBulkChange && selectedTimes.size > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      정원 변경 또는 마감 옵션 중 하나를 선택하세요.
                    </p>
                  ) : null}
                  {hasInvalidBulkTargetDate ? (
                    <p
                      className="mt-2 text-xs font-semibold text-rose-700"
                      role="alert"
                    >
                      적용 날짜는 YYYY-MM-DD 형식이어야 합니다.
                    </p>
                  ) : null}
                  {!isBulkCapacityValid ? (
                    <p
                      className="mt-2 text-xs font-semibold text-rose-700"
                      role="alert"
                    >
                      정원은 {BULK_MIN_CAPACITY}명 이상 {BULK_MAX_CAPACITY}
                      명 이하의 정수여야 합니다.
                    </p>
                  ) : null}
                  {isOverBulkLimit ? (
                    <p
                      className="mt-2 text-xs font-semibold text-rose-700"
                      role="alert"
                    >
                      한 번에 최대{" "}
                      {ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT}건까지만
                      적용할 수 있습니다.
                    </p>
                  ) : null}
                  {bulkSaveState.status === "success" ? (
                    <p
                      className="mt-2 text-xs font-semibold text-emerald-700"
                      role="status"
                    >
                      {bulkSaveState.updatedCount}건이 반영되었습니다.
                    </p>
                  ) : null}
                  {bulkSaveState.status === "error" ? (
                    <p
                      className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-800"
                      role="alert"
                    >
                      {bulkSaveState.message}
                    </p>
                  ) : null}
                  {bulkSaveState.status === "conflict" ? (
                    <div
                      className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-3"
                      role="alert"
                    >
                      <p className="text-xs font-semibold text-rose-800">
                        {bulkSaveState.message}
                      </p>
                      <ul className="mt-2 flex flex-col gap-1 text-xs text-rose-900">
                        {bulkSaveState.conflicts.map((conflict) => (
                          <li key={`${conflict.date}_${conflict.time}`}>
                            {conflict.date} {conflict.time} · 예약{" "}
                            {conflict.reservedCount}건
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-rose-700">
                        이번 일괄 변경은 적용되지 않았습니다. 충돌 시간을
                        제외하고 다시 적용해주세요.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={(event) =>
                            handleToggleAll(event.target.checked)
                          }
                          disabled={isSavingSlotChange}
                          aria-label="전체 선택"
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </th>
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
                      const rowCapacityIsValid = isValidCapacity(
                        draft.capacity,
                      );
                      const canSave =
                        Boolean(savedToken) &&
                        dirty &&
                        rowCapacityIsValid &&
                        !hasRowSaving &&
                        bulkSaveState.status !== "saving" &&
                        !isSaving;

                      return (
                        <tr
                          key={slot.time}
                          className="border-b border-slate-100 align-top"
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedTimes.has(slot.time)}
                              onChange={(event) =>
                                handleToggleRow(
                                  slot.time,
                                  event.target.checked,
                                )
                              }
                              disabled={isSavingSlotChange}
                              aria-label={`${slot.time} 일괄 선택`}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
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
                              disabled={isSavingSlotChange}
                              className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
                                disabled={isSavingSlotChange}
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
                              {!rowCapacityIsValid ? (
                                <p
                                  className="text-xs font-semibold text-rose-700"
                                  role="alert"
                                >
                                  정원은 1~999명이어야 합니다.
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
              </>
            )
          ) : null}
        </section>
      </section>
    </main>
  );
}
