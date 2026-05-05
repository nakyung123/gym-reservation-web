"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createReservation } from "@/lib/reservation-service";
import {
  getReservationTimeState,
  type ReservationTimeState,
} from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import {
  EMPTY_RESERVATION_SNAPSHOT,
  parseReservationSnapshot,
} from "@/lib/reservation-repository";
import type { Gym, Sport } from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
};

type DateOption = {
  label: string;
  value: string;
};

type NoticeTone = "success" | "warning" | "error";

const mockUserId = "local-demo-user";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const unavailableTimeLabels = {
  "gym-mismatch": "선택 불가",
  "sport-unavailable": "종목 불가",
  "time-unavailable": "시간 불가",
  "invalid-date-time": "형식 오류",
  "past-time": "지난 시간",
  "duplicate-active-reservation": "예약 완료",
};

const noticeStyles: Record<NoticeTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

const noticeLinkStyles: Record<NoticeTone, string> = {
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  warning: "bg-amber-700 text-white hover:bg-amber-800",
  error: "bg-rose-700 text-white hover:bg-rose-800",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTodayDateSnapshot() {
  return formatDateValue(new Date());
}

function getServerDateSnapshot() {
  return "";
}

function subscribeDateSnapshot(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const mountTimer = window.setTimeout(listener, 0);
  const intervalTimer = window.setInterval(listener, 60_000);

  return () => {
    window.clearTimeout(mountTimer);
    window.clearInterval(intervalTimer);
  };
}

function createDateOptions(todayValue: string): DateOption[] {
  const [year, month, day] = todayValue.split("-").map(Number);
  const today = new Date(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    const label =
      index === 0
        ? "오늘"
        : index === 1
          ? "내일"
          : `${weekdays[date.getDay()]}요일`;

    return {
      label,
      value: formatDateValue(date),
    };
  });
}

function getTimeButtonClass(
  timeState: ReservationTimeState,
  isSelected: boolean,
) {
  if (timeState.available) {
    return isSelected
      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
      : "border-slate-300 text-slate-700 hover:border-emerald-400";
  }

  if (timeState.reason === "duplicate-active-reservation") {
    return "cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (timeState.reason === "past-time") {
    return "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
  }

  return isSelected
    ? "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-800"
    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
}

export function ReservationForm({ gym }: ReservationFormProps) {
  const [selectedSport, setSelectedSport] = useState<Sport>(gym.sports[0]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState(gym.availableTimes[0]);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("success");
  const [createdReservationId, setCreatedReservationId] = useState<
    string | null
  >(null);
  const reservationSnapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    () => EMPTY_RESERVATION_SNAPSHOT,
  );
  const todayValue = useSyncExternalStore(
    subscribeDateSnapshot,
    getTodayDateSnapshot,
    getServerDateSnapshot,
  );
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
  );
  const dateOptions = useMemo(
    () => (todayValue ? createDateOptions(todayValue) : []),
    [todayValue],
  );
  const effectiveSelectedDate =
    dateOptions.find((date) => date.value === selectedDate)?.value ??
    dateOptions[0]?.value ??
    "";
  const isDateReady =
    dateOptions.length > 0 && effectiveSelectedDate.length > 0;

  const price = useMemo(
    () => gym.sportPrices[selectedSport] ?? gym.basePrice,
    [gym.basePrice, gym.sportPrices, selectedSport],
  );

  const timeStates = useMemo<
    Map<string, ReservationTimeState>
  >(() => {
    if (!isDateReady) {
      return new Map();
    }

    const now = new Date();

    return new Map(
      gym.availableTimes.map((time) => [
        time,
        getReservationTimeState({
          gym,
          reservations,
          draft: {
            userId: mockUserId,
            gymId: gym.id,
            sport: selectedSport,
            date: effectiveSelectedDate,
            time,
            price,
          },
          now,
        }),
      ]),
    );
  }, [
    effectiveSelectedDate,
    gym,
    isDateReady,
    price,
    reservations,
    selectedSport,
  ]);
  const selectedTimeState = isDateReady
    ? (timeStates.get(selectedTime) ?? {
        available: false as const,
        reason: "time-unavailable" as const,
        message: "선택한 시간이 예약 가능 시간 목록에 없습니다.",
      })
    : {
        available: false as const,
        reason: "invalid-date-time" as const,
        message: "예약 날짜를 준비하고 있습니다.",
      };
  const submitDisabledReason = !isDateReady
    ? "예약 날짜를 준비하고 있습니다."
    : !reservationReadResult.ok
      ? reservationReadResult.message
      : selectedTimeState.available
        ? null
      : selectedTimeState.message;

  const resetNotice = () => {
    setNotice(null);
    setCreatedReservationId(null);
  };

  const handleReserve = () => {
    const result = createReservation({
      gym,
      draft: {
        userId: mockUserId,
        gymId: gym.id,
        sport: selectedSport,
        date: effectiveSelectedDate,
        time: selectedTime,
        price,
      },
    });

    setNotice(result.message);

    if (result.ok) {
      setNoticeTone("success");
      setCreatedReservationId(result.reservation.id);
      return;
    }

    if (result.status === "duplicate") {
      setNoticeTone("warning");
      setCreatedReservationId(result.reservation.id);
      return;
    }

    setNoticeTone("error");
    setCreatedReservationId(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-sky-700">예약 선택</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{gym.name}</h1>
        <p className="mt-2 text-sm text-slate-600">{gym.address}</p>

        <div className="mt-7 grid gap-6">
          <fieldset>
            <legend className="text-sm font-bold text-slate-950">종목</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {gym.sports.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => {
                    setSelectedSport(sport);
                    resetNotice();
                  }}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
                    selectedSport === sport
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 text-slate-700 hover:border-sky-400 hover:text-sky-800"
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-slate-950">날짜</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {isDateReady ? (
                dateOptions.map((date) => (
                  <button
                    key={date.value}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date.value);
                      resetNotice();
                    }}
                    className={`rounded-md border px-3 py-3 text-left text-sm transition ${
                      effectiveSelectedDate === date.value
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 text-slate-700 hover:border-sky-400"
                    }`}
                  >
                    <span className="block font-semibold">{date.label}</span>
                    <span className="mt-1 block text-xs opacity-80">
                      {date.value}
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                  예약 날짜를 준비하고 있습니다.
                </div>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-slate-950">시간</legend>
            {isDateReady ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {gym.availableTimes.map((time) => {
                    const timeState = timeStates.get(time) ?? {
                      available: false as const,
                      reason: "time-unavailable" as const,
                      message: "선택한 시간이 예약 가능 시간 목록에 없습니다.",
                    };
                    const isSelected = selectedTime === time;

                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={!timeState.available}
                        onClick={() => {
                          setSelectedTime(time);
                          resetNotice();
                        }}
                        className={`min-h-14 rounded-md border px-2 text-sm font-semibold transition ${getTimeButtonClass(
                          timeState,
                          isSelected,
                        )}`}
                        title={
                          timeState.available ? "예약 가능" : timeState.message
                        }
                      >
                        <span className="block">{time}</span>
                        {!timeState.available ? (
                          <span className="mt-1 block text-[11px] leading-4">
                            {unavailableTimeLabels[timeState.reason]}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  지난 시간은 선택할 수 없고, 예약한 시간은 예약 완료로
                  표시됩니다.
                </p>
              </>
            ) : (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                예약 날짜를 준비하고 있습니다.
              </div>
            )}
          </fieldset>
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">예약 요약</p>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">체육관</dt>
            <dd className="font-semibold text-slate-950">{gym.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">종목</dt>
            <dd className="font-semibold text-slate-950">{selectedSport}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">날짜</dt>
            <dd className="font-semibold text-slate-950">
              {effectiveSelectedDate || "준비 중"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">시간</dt>
            <dd className="font-semibold text-slate-950">{selectedTime}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
            <dt className="font-bold text-slate-950">금액</dt>
            <dd className="font-bold text-slate-950">
              {price.toLocaleString()}원
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={handleReserve}
          disabled={Boolean(submitDisabledReason)}
          className="mt-6 h-11 w-full rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          예약하기
        </button>

        {submitDisabledReason ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">
            {submitDisabledReason}
          </p>
        ) : null}

        {notice ? (
          <div
            className={`mt-4 rounded-md border p-4 text-sm font-semibold ${noticeStyles[noticeTone]}`}
          >
            <p>{notice}</p>
            {createdReservationId ? (
              <Link
                href="/reservations"
                className={`mt-3 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition ${noticeLinkStyles[noticeTone]}`}
              >
                내 예약 보기
              </Link>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
