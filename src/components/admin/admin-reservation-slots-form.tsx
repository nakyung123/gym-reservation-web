"use client";

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
  addDaysToDateValue,
  getAdminBulkSlotTargetCount,
  isAdminBulkSlotDateValue,
  isAdminBulkSlotTargetOverLimit,
  normalizeAdminBulkSlotDates,
} from "@/lib/admin/admin-reservation-slot-policy";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminTable,
  AdminTd,
  AdminTr,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";
import { SelectMenu } from "@/components/ui/select-menu";
import type { Gym, ReservationSlotAvailability, Sport } from "@/types/domain";

import { isAbortError } from "@/lib/async-error";
import { getTodayValue } from "@/lib/admin/admin-date-format";
const BULK_DEFAULT_CAPACITY = 10;
const BULK_MIN_CAPACITY = 1;
const BULK_MAX_CAPACITY = 999;

type BulkClosedMode = "none" | "close" | "open";

// 일괄 적용의 마감 옵션. SelectMenu(공용 드롭다운)에 그대로 넘긴다.
const BULK_CLOSED_MODE_OPTIONS: { value: BulkClosedMode; label: string }[] = [
  { value: "none", label: "변경 안 함" },
  { value: "close", label: "마감 적용" },
  { value: "open", label: "마감 해제" },
];

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
  | { status: "success" }
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
  available: "bg-success/10 text-success border-success/30",
  full: "bg-warning/10 text-warning border-warning/30",
  closed: "bg-surface-2 text-foreground border-line-strong",
};

const BULK_DATE_WEEK_PRESETS = [1, 2, 3, 4] as const;


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
    if (!selectedGym || !selectedSport) return;
    const draft = rowDrafts.get(slot.time);
    if (!draft) return;
    if (!isValidCapacity(draft.capacity)) {
      setRowSaveStates((prev) => {
        const next = new Map(prev);
        next.set(slot.time, {
          status: "error",
          message: "정원은 1팀 이상 999팀 이하의 정수여야 합니다.",
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
      // 저장 성공을 사용자에게 알리는 짧은 상태. draft 재수정 또는 다음 저장 진입 시
      // 기존 정리 로직(handleDraftChange/handleSaveRow 진입부)에서 자연스럽게 사라진다.
      setRowSaveStates((prev) => {
        const next = new Map(prev);
        next.set(slot.time, { status: "success" });
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

  // selectedDate 기준 N*7일 후 날짜를 추가 날짜 목록에 넣는다.
  // 같은 헬퍼(addAdminBulkSlotDate)를 거치므로 중복·형식·한도 검증을 공통으로 적용한다.
  const handleAddBulkWeekPreset = (weeks: number) => {
    if (isSavingSlotChange) return;

    const nextDate = addDaysToDateValue(selectedDate, weeks * 7);
    if (!nextDate) {
      setBulkDateNotice({
        tone: "error",
        message: "조회 날짜를 먼저 정확히 선택해주세요.",
      });
      return;
    }

    const result = addAdminBulkSlotDate(bulkTargetDates, nextDate);
    if (!result.ok) {
      setBulkDateNotice({ tone: "error", message: result.message });
      return;
    }

    setBulkAdditionalDates(
      result.dates.filter((date) => date !== selectedDate),
    );
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
    selectedTimes.size > 0 &&
    bulkTargetDates.length > 0 &&
    !hasInvalidBulkTargetDate &&
    !isOverBulkLimit &&
    isBulkCapacityValid &&
    hasBulkChange &&
    !hasRowSaving &&
    bulkSaveState.status !== "saving";

  const handleBulkApply = async () => {
    if (!selectedGym || !selectedSport) return;
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
      result = await bulkUpdateReservationSlotPolicy(input, controller.signal);
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
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="mb-4 text-[15px] font-bold text-foreground">
            조회 조건
          </h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={ADMIN_FIELD_LABEL_CLASS}>체육관</span>
              <SelectMenu
                value={selectedGymId}
                options={gyms.map((gym) => ({
                  value: gym.id,
                  label: gym.name,
                }))}
                placeholder="체육관이 없습니다"
                ariaLabel="체육관"
                disabled={gyms.length === 0 || isSavingSlotChange}
                onChange={handleGymChange}
                triggerClassName={ADMIN_CONTROL_CLASS}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={ADMIN_FIELD_LABEL_CLASS}>종목</span>
              <SelectMenu
                value={selectedSport}
                options={
                  selectedGym
                    ? selectedGym.sports.map((sport) => ({
                        value: sport,
                        label: sport,
                      }))
                    : []
                }
                placeholder="종목 없음"
                ariaLabel="종목"
                disabled={!selectedGym || isSavingSlotChange}
                onChange={(value) => handleSportChange(value as Sport)}
                triggerClassName={ADMIN_CONTROL_CLASS}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="slot-date" className={ADMIN_FIELD_LABEL_CLASS}>
                날짜
              </label>
              <input
                id="slot-date"
                type="date"
                value={selectedDate}
                onChange={(event) => handleDateChange(event.target.value)}
                disabled={isSavingSlotChange}
                className={ADMIN_CONTROL_CLASS}
              />
            </div>
            <Button
              size="console"
              onClick={handleQuery}
              disabled={!canQuery || slotsState.status === "loading"}
            >
              {slotsState.status === "loading" ? (
                <>
                  <AdminButtonSpinner />
                  조회 중
                </>
              ) : (
                "조회"
              )}
            </Button>
          </div>
          {isSavingSlotChange ? (
            <p className="mt-2 text-[13px] font-semibold text-warning">
              저장이 끝난 뒤 조회 조건을 변경할 수 있습니다.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <h2 className="mb-4 text-[15px] font-bold text-foreground">
            시간대 슬롯
          </h2>

          {slotsState.status === "idle" ? (
            <AdminEmptyState
              title="아직 슬롯을 조회하지 않았습니다"
              description="체육관·종목·날짜를 선택하고 조회를 누르면 시간대별 슬롯이 표시됩니다."
            />
          ) : null}

          {slotsState.status === "loading" ? (
            <AdminLoadingRow message="페이지를 불러오는 중입니다." />
          ) : null}

          {slotsState.status === "error" ? (
            <p
              className="mt-3 rounded-xl border border-error/30 bg-error/10 px-5 py-3.5 text-[13.5px] font-semibold text-error"
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
                <div className="mt-3 rounded-xl border border-accent/20 bg-accent-tint p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      일괄 적용
                    </p>
                    <p className="text-[13px] font-semibold text-muted">
                      선택된 시간 {selectedTimes.size}개
                      {selectedTimes.size > 0
                        ? ` · 적용 날짜 ${bulkTargetDates.length}개 · 대상 ${bulkTargetCount}건`
                        : ""}
                    </p>
                  </div>
                  <div className="mt-4 rounded-xl border border-line bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="flex flex-col gap-1.5 text-[12.5px] font-bold text-foreground">
                        추가 날짜
                        <input
                          type="date"
                          value={bulkDateInput}
                          onChange={(event) => {
                            setBulkDateInput(event.target.value);
                            setBulkDateNotice(null);
                          }}
                          disabled={isSavingSlotChange}
                          className={ADMIN_CONTROL_CLASS}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="console"
                        onClick={handleAddBulkDate}
                        disabled={isSavingSlotChange}
                      >
                        날짜 추가
                      </Button>
                    </div>
                    {/* 운영자가 매주 같은 요일에 동일 정책을 반영하는 반복 작업을 줄이기 위한 프리셋.
                        조회 날짜(selectedDate)에 7·14·21·28일을 더해 같은 헬퍼를 거쳐 추가한다. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-muted">
                        빠른 추가
                      </span>
                      {BULK_DATE_WEEK_PRESETS.map((weeks) => (
                        <button
                          key={weeks}
                          type="button"
                          onClick={() => handleAddBulkWeekPreset(weeks)}
                          disabled={isSavingSlotChange}
                          className="inline-flex h-9 items-center rounded-md border border-line-strong bg-white px-3 text-[13px] font-bold text-foreground transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                        >
                          +{weeks}주 같은 요일
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex h-7 items-center rounded-full border border-accent/20 bg-accent-tint px-3 text-[12.5px] font-bold tabular-nums text-accent-strong">
                        조회 날짜 {selectedDate}
                      </span>
                      {bulkAdditionalDates.map((date) => (
                        <span
                          key={date}
                          className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-[12.5px] font-bold tabular-nums text-foreground"
                        >
                          {date}
                          <button
                            type="button"
                            onClick={() => handleRemoveBulkDate(date)}
                            disabled={isSavingSlotChange}
                            aria-label={`${date} 적용 날짜 제거`}
                            className="rounded text-muted transition hover:text-error disabled:cursor-not-allowed disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {bulkDateNotice ? (
                      <p
                        className={`mt-2 text-[13px] font-semibold ${
                          bulkDateNotice.tone === "error"
                            ? "text-error"
                            : "text-success"
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
                    <div className="flex flex-col gap-1.5 text-[12.5px] font-bold text-foreground">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={bulkCapacityEnabled}
                          onChange={(event) =>
                            setBulkCapacityEnabled(event.target.checked)
                          }
                          disabled={isSavingSlotChange}
                          className="size-4 rounded border-line-strong"
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
                        className={`${ADMIN_CONTROL_CLASS} w-24 tabular-nums`}
                      />
                    </div>
                    <div className="flex min-w-40 flex-col gap-1.5">
                      <span className={ADMIN_FIELD_LABEL_CLASS}>마감</span>
                      <SelectMenu
                        value={bulkClosedMode}
                        options={BULK_CLOSED_MODE_OPTIONS}
                        placeholder="변경 안 함"
                        ariaLabel="마감"
                        disabled={isSavingSlotChange}
                        onChange={(value) =>
                          setBulkClosedMode(value as BulkClosedMode)
                        }
                        triggerClassName={ADMIN_CONTROL_CLASS}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBulkApply}
                      disabled={!canBulkApply}
                      className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-[19px] text-[15.5px] font-bold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
                  {selectedTimes.size === 0 ? (
                    <p className="mt-2 text-[13px] text-muted">
                      아래 표에서 일괄 적용할 시간을 선택하세요.
                    </p>
                  ) : null}
                  {!hasBulkChange && selectedTimes.size > 0 ? (
                    <p className="mt-2 text-[13px] text-muted">
                      정원 변경 또는 마감 옵션 중 하나를 선택하세요.
                    </p>
                  ) : null}
                  {hasInvalidBulkTargetDate ? (
                    <p
                      className="mt-2 text-[13px] font-semibold text-error"
                      role="alert"
                    >
                      적용 날짜는 YYYY-MM-DD 형식이어야 합니다.
                    </p>
                  ) : null}
                  {!isBulkCapacityValid ? (
                    <p
                      className="mt-2 text-[13px] font-semibold text-error"
                      role="alert"
                    >
                      정원은 {BULK_MIN_CAPACITY}팀 이상 {BULK_MAX_CAPACITY}
                      팀 이하의 정수여야 합니다.
                    </p>
                  ) : null}
                  {isOverBulkLimit ? (
                    <p
                      className="mt-2 text-[13px] font-semibold text-error"
                      role="alert"
                    >
                      현재 대상 {bulkTargetCount}건 · 한 번에 최대{" "}
                      {ADMIN_RESERVATION_SLOT_BULK_TARGET_LIMIT}건까지만
                      적용할 수 있습니다. 날짜나 시간을 줄여 다시 시도해주세요.
                    </p>
                  ) : null}
                  {bulkSaveState.status === "success" ? (
                    <p
                      className="mt-2 text-[13px] font-semibold text-success"
                      role="status"
                    >
                      {bulkSaveState.updatedCount}건이 반영되었습니다.
                    </p>
                  ) : null}
                  {bulkSaveState.status === "error" ? (
                    <p
                      className="mt-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[13px] font-semibold text-error"
                      role="alert"
                    >
                      {bulkSaveState.message}
                    </p>
                  ) : null}
                  {bulkSaveState.status === "conflict" ? (
                    <div
                      className="mt-2 rounded-xl border border-error/30 bg-error/10 p-4"
                      role="alert"
                    >
                      <p className="text-[13px] font-semibold text-error">
                        {bulkSaveState.message}
                      </p>
                      <ul className="mt-2 flex flex-col gap-1 text-[13px] text-error">
                        {bulkSaveState.conflicts.map((conflict) => (
                          <li key={`${conflict.date}_${conflict.time}`}>
                            {conflict.date} {conflict.time} · 예약{" "}
                            {conflict.reservedCount}건
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[13px] text-error">
                        이번 일괄 변경은 적용되지 않았습니다. 충돌 시간을
                        제외하고 다시 적용해주세요.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4">
                <AdminTable
                  minWidth="min-w-[860px]"
                  columns={[
                    {
                      key: "select-all",
                      width: "w-12",
                      label: (
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={(event) =>
                            handleToggleAll(event.target.checked)
                          }
                          disabled={isSavingSlotChange}
                          aria-label="전체 선택"
                          className="size-4 rounded border-line-strong"
                        />
                      ),
                    },
                    { label: "시간" },
                    { label: "정원" },
                    { label: "마감" },
                    { label: "예약 / 잔여" },
                    { label: "상태" },
                    { label: "저장", align: "right" },
                  ]}
                >
                    {slotsState.slots.map((slot) => {
                      const draft = rowDrafts.get(slot.time) ?? {
                        capacity: slot.capacity,
                        isClosed: slot.isClosed,
                      };
                      const dirty = isRowDirty(slot);
                      const saveState = rowSaveStates.get(slot.time);
                      const isSaving = saveState?.status === "saving";
                      const isSaveSuccess = saveState?.status === "success";
                      const saveError =
                        saveState?.status === "error"
                          ? saveState.message
                          : null;
                      const rowCapacityIsValid = isValidCapacity(
                        draft.capacity,
                      );
                      const canSave =
                        dirty &&
                        rowCapacityIsValid &&
                        !hasRowSaving &&
                        bulkSaveState.status !== "saving" &&
                        !isSaving;

                      return (
                        <AdminTr key={slot.time} selected={isSaving} align="top">
                          <AdminTd valign="top">
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
                              className="mt-1.5 size-4 rounded border-line-strong"
                            />
                          </AdminTd>
                          <AdminTd
                            valign="top"
                            className="pt-4 font-semibold tabular-nums"
                          >
                            {slot.time}
                          </AdminTd>
                          <AdminTd valign="top">
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
                              className={`${ADMIN_CONTROL_CLASS} w-20 tabular-nums`}
                            />
                          </AdminTd>
                          <AdminTd valign="top" className="pt-4">
                            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                              <input
                                type="checkbox"
                                checked={draft.isClosed}
                                onChange={(event) =>
                                  handleDraftChange(slot.time, {
                                    isClosed: event.target.checked,
                                  })
                                }
                                disabled={isSavingSlotChange}
                                className="size-4 rounded border-line-strong"
                              />
                              마감
                            </label>
                          </AdminTd>
                          <AdminTd
                            valign="top"
                            className="pt-4 tabular-nums text-muted"
                          >
                            {slot.reservedCount}팀 / 잔여 {slot.remaining}팀
                          </AdminTd>
                          <AdminTd valign="top" className="pt-3.5">
                            <span
                              className={`inline-flex h-6 items-center rounded-full border px-2 text-[11.5px] font-bold ${STATUS_BADGE_STYLES[slot.status]}`}
                            >
                              {STATUS_LABELS[slot.status]}
                            </span>
                          </AdminTd>
                          <AdminTd valign="top" align="right">
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                size="xs"
                                onClick={() => handleSaveRow(slot)}
                                disabled={!canSave}
                              >
                                {isSaving
                                  ? "저장 중"
                                  : dirty
                                    ? "저장"
                                    : "변경 없음"}
                              </Button>
                              {isSaveSuccess ? (
                                <p
                                  className="text-[12px] font-semibold text-success"
                                  role="status"
                                >
                                  저장 완료
                                </p>
                              ) : null}
                              {saveError ? (
                                <p
                                  className="text-right text-[12px] font-semibold text-error"
                                  role="alert"
                                >
                                  {saveError}
                                </p>
                              ) : null}
                              {!rowCapacityIsValid ? (
                                <p
                                  className="text-right text-[12px] font-semibold text-error"
                                  role="alert"
                                >
                                  정원은 1~999팀이어야 합니다.
                                </p>
                              ) : null}
                            </div>
                          </AdminTd>
                        </AdminTr>
                      );
                    })}
                </AdminTable>
                </div>
              </>
            )
          ) : null}
        </section>
    </div>
  );
}
