"use client";

import Link from "next/link";
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice, getGymSportPrice } from "@/lib/gym-utils";
import { createReservation } from "@/lib/reservation-service";
import {
  getReservationTimeState,
  type ReservationTimeState,
} from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import type { Gym, Reservation, Sport } from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
};

type DateOption = {
  label: string;
  value: string;
};

type NoticeTone = "success" | "warning" | "error";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const unavailableTimeLabels = {
  "gym-mismatch": "선택 불가",
  "sport-unavailable": "종목 불가",
  "time-unavailable": "시간 불가",
  "invalid-date-time": "형식 오류",
  "past-time": "지난 시간",
  "duplicate-active-reservation": "내 예약",
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

const reservationNoticeButtonStyles: Record<NoticeTone, string> = {
  success:
    "mt-6 h-11 w-full rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white transition disabled:cursor-default disabled:bg-emerald-700 disabled:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
  warning:
    "mt-6 h-11 w-full rounded-md bg-amber-700 px-5 text-sm font-semibold text-white transition disabled:cursor-default disabled:bg-amber-700 disabled:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
  error:
    "mt-6 h-11 w-full rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMinuteValue(date: Date) {
  return `${formatDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function getCurrentMinuteSnapshot() {
  return formatMinuteValue(new Date());
}

function getServerMinuteSnapshot() {
  return "";
}

function subscribeMinuteSnapshot(listener: () => void) {
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
  const [noticeReservation, setNoticeReservation] =
    useState<Reservation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resetNotice = useCallback(() => {
    setNotice(null);
    setNoticeReservation(null);
  }, []);
  const authSessionSnapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const reservationSnapshot = useSyncExternalStore(
    reservationRepository.subscribe,
    reservationRepository.getSnapshot,
    reservationRepository.getServerSnapshot,
  );
  const currentMinuteValue = useSyncExternalStore(
    subscribeMinuteSnapshot,
    getCurrentMinuteSnapshot,
    getServerMinuteSnapshot,
  );
  const reservationReadResult = useMemo(
    () => parseReservationSnapshot(reservationSnapshot),
    [reservationSnapshot],
  );
  const authSession = useMemo(
    () => parseFirebaseAuthSessionSnapshot(authSessionSnapshot),
    [authSessionSnapshot],
  );
  const reservationUserId = authSession.ok ? authSession.userId : "";
  const reservations = useMemo(
    () => (reservationReadResult.ok ? reservationReadResult.reservations : []),
    [reservationReadResult],
  );
  const dateOptions = useMemo(
    () =>
      currentMinuteValue
        ? createDateOptions(currentMinuteValue.slice(0, 10))
        : [],
    [currentMinuteValue],
  );
  const effectiveSelectedDate =
    dateOptions.find((date) => date.value === selectedDate)?.value ??
    dateOptions[0]?.value ??
    "";
  const isDateReady =
    dateOptions.length > 0 && effectiveSelectedDate.length > 0;

  const price = useMemo(
    () => getGymSportPrice(gym, selectedSport),
    [gym, selectedSport],
  );

  const timeStates = useMemo<Map<string, ReservationTimeState>>(() => {
    if (!isDateReady || !authSession.ok) {
      return new Map();
    }

    const now = new Date(currentMinuteValue);

    return new Map(
      gym.availableTimes.map((time) => [
        time,
        getReservationTimeState({
          gym,
          reservations,
          draft: {
            userId: authSession.userId,
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
    authSession,
    currentMinuteValue,
    gym,
    isDateReady,
    price,
    reservations,
    selectedSport,
  ]);
  const hasReservationNotice = noticeReservation !== null;
  const timeSelectionDisabledReason = !authSession.ok
    ? authSession.message
    : reservationReadResult.ok
      ? null
      : reservationReadResult.message;
  const firstAvailableTime = useMemo(() => {
    if (!isDateReady || timeSelectionDisabledReason || hasReservationNotice) {
      return null;
    }

    return (
      gym.availableTimes.find((time) => timeStates.get(time)?.available) ?? null
    );
  }, [
    gym.availableTimes,
    hasReservationNotice,
    isDateReady,
    timeSelectionDisabledReason,
    timeStates,
  ]);
  const selectedTimeStateCandidate = isDateReady
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
  const effectiveSelectedTime =
    !hasReservationNotice &&
    !selectedTimeStateCandidate.available &&
    firstAvailableTime
      ? firstAvailableTime
      : selectedTime;
  const selectedTimeState = isDateReady
    ? (timeStates.get(effectiveSelectedTime) ?? {
        available: false as const,
        reason: "time-unavailable" as const,
        message: "선택한 시간이 예약 가능 시간 목록에 없습니다.",
      })
    : selectedTimeStateCandidate;
  const submitDisabledReason = isSubmitting
    ? "예약을 처리하고 있습니다."
    : !authSession.ok
      ? authSession.message
      : !isDateReady
        ? "예약 날짜를 준비하고 있습니다."
        : !reservationReadResult.ok
          ? reservationReadResult.message
          : selectedTimeState.available
            ? null
            : selectedTimeState.message;
  const timeSelectionDisabledLabel =
    (!authSession.ok && authSession.reason === "not-ready") ||
    (!reservationReadResult.ok && reservationReadResult.reason === "not-ready")
      ? "확인 중"
      : "확인 불가";
  const shouldShowSubmitDisabledReason =
    Boolean(submitDisabledReason) && !hasReservationNotice;
  const availableTimeCount = useMemo(() => {
    if (!isDateReady || timeSelectionDisabledReason) {
      return 0;
    }

    return gym.availableTimes.filter(
      (time) => timeStates.get(time)?.available,
    ).length;
  }, [gym.availableTimes, isDateReady, timeSelectionDisabledReason, timeStates]);
  const reserveButtonLabel = isSubmitting
    ? "예약 처리 중"
    : hasReservationNotice
      ? noticeTone === "success"
        ? "예약 완료"
        : "이미 예약됨"
      : "예약하기";
  const reserveButtonClass = hasReservationNotice
    ? reservationNoticeButtonStyles[noticeTone]
    : "mt-6 h-11 w-full rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2";

  const handleReserve = async () => {
    if (isSubmitting) {
      return;
    }

    if (!authSession.ok) {
      setNotice(authSession.message);
      setNoticeTone("error");
      setNoticeReservation(null);
      return;
    }

    setIsSubmitting(true);
    const reservationTime = effectiveSelectedTime;
    resetNotice();

    try {
      const result = await createReservation({
        gym,
        draft: {
          userId: reservationUserId,
          gymId: gym.id,
          sport: selectedSport,
          date: effectiveSelectedDate,
          time: reservationTime,
          price,
        },
      });

      setNotice(result.message);

      if (result.ok) {
        setNoticeTone("success");
        setNoticeReservation(result.reservation);
        setSelectedTime(result.reservation.time);
        return;
      }

      if (result.status === "duplicate") {
        setNoticeTone("warning");
        setNoticeReservation(result.reservation);
        setSelectedTime(result.reservation.time);
        return;
      }

      setNoticeTone("error");
      setNoticeReservation(null);
    } catch {
      setNotice("예약 처리 중 예상하지 못한 오류가 발생했습니다.");
      setNoticeTone("error");
      setNoticeReservation(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-sky-700">예약 선택</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{gym.name}</h1>
        <p className="mt-2 text-sm text-slate-600">{gym.address}</p>

        <div className="mt-7 grid min-w-0 gap-6">
          <fieldset>
            <legend className="text-sm font-bold text-slate-950">종목</legend>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="종목 선택">
              {gym.sports.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  aria-pressed={selectedSport === sport}
                  onClick={() => {
                    setSelectedSport(sport);
                    resetNotice();
                  }}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
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
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {isDateReady ? (
                dateOptions.map((date) => (
                  <button
                    key={date.value}
                    type="button"
                    aria-pressed={effectiveSelectedDate === date.value}
                    onClick={() => {
                      setSelectedDate(date.value);
                      resetNotice();
                    }}
                    className={`min-w-0 rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
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
                <div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500 sm:col-span-4">
                  날짜를 준비하고 있습니다.
                </div>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-slate-950">시간</legend>
            {isDateReady ? (
              <>
                <div className="mt-3 grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-5">
                  {gym.availableTimes.map((time) => {
                    const timeState = timeStates.get(time) ?? {
                      available: false as const,
                      reason: "time-unavailable" as const,
                      message: "선택한 시간이 예약 가능 시간 목록에 없습니다.",
                    };
                    const isSelected = effectiveSelectedTime === time;
                    const timeButtonStateClass = timeSelectionDisabledReason
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : getTimeButtonClass(timeState, isSelected);
                    const isDisabled =
                      Boolean(timeSelectionDisabledReason) ||
                      !timeState.available;
                    const timeLabel = timeSelectionDisabledReason
                      ? timeSelectionDisabledLabel
                      : !timeState.available
                        ? unavailableTimeLabels[timeState.reason]
                        : null;

                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isDisabled}
                        aria-pressed={!isDisabled && isSelected}
                        aria-label={`${time}${timeLabel ? ` - ${timeLabel}` : " - 예약 가능"}`}
                        onClick={() => {
                          setSelectedTime(time);
                          resetNotice();
                        }}
                        className={`min-h-14 rounded-md border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${timeButtonStateClass}`}
                        title={
                          timeSelectionDisabledReason ??
                          (timeState.available ? "예약 가능" : timeState.message)
                        }
                      >
                        <span className="block">{time}</span>
                        {timeLabel ? (
                          <span className="mt-1 block text-[11px] leading-4">
                            {timeLabel}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {timeSelectionDisabledReason ? (
                  <p className="mt-3 text-sm font-semibold text-amber-700" role="alert">
                    {timeSelectionDisabledReason}
                  </p>
                ) : availableTimeCount === 0 ? (
                  <p className="mt-3 text-sm font-semibold text-amber-700" role="alert">
                    선택한 날짜에는 예약 가능한 시간이 없습니다. 다른 날짜를
                    선택해주세요.
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {availableTimeCount}개 시간대 예약 가능 · 지난 시간과 내
                    예약 시간은 선택할 수 없습니다.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                날짜를 준비하고 있습니다.
              </div>
            )}
          </fieldset>
        </div>
      </section>

      <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
            <dd className="font-semibold text-slate-950">
              {effectiveSelectedTime}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
            <dt className="font-bold text-slate-950">금액</dt>
            <dd className="font-bold text-slate-950">
              {formatGymPrice(price)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={handleReserve}
          disabled={Boolean(submitDisabledReason) || hasReservationNotice}
          className={reserveButtonClass}
        >
          {reserveButtonLabel}
        </button>

        {shouldShowSubmitDisabledReason ? (
          <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
            {submitDisabledReason}
          </p>
        ) : null}

        {notice ? (
          <div
            role="alert"
            className={`mt-4 rounded-md border p-4 text-sm font-semibold ${noticeStyles[noticeTone]}`}
          >
            <p>{notice}</p>
            {noticeReservation ? (
              <>
                <dl className="mt-3 grid gap-2 border-t border-current/20 pt-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="opacity-75">예약번호</dt>
                    <dd className="mt-1 text-sm">
                      {noticeReservation.id.slice(0, 8)}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-75">체육관</dt>
                    <dd className="mt-1 text-sm">{gym.name}</dd>
                  </div>
                  <div>
                    <dt className="opacity-75">종목</dt>
                    <dd className="mt-1 text-sm">{noticeReservation.sport}</dd>
                  </div>
                  <div>
                    <dt className="opacity-75">이용 일시</dt>
                    <dd className="mt-1 text-sm">
                      {noticeReservation.date} {noticeReservation.time}
                    </dd>
                  </div>
                </dl>
                <Link
                  href="/reservations"
                  aria-label="내 예약 목록 보기"
                  className={`mt-3 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${noticeLinkStyles[noticeTone]}`}
                >
                  내 예약 보기
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
