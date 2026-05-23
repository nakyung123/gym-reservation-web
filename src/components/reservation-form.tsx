"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  formatDateValue,
  useCurrentMinuteValue,
} from "@/hooks/use-current-minute";
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
import { fetchReservationSlots } from "@/lib/reservation-slot-availability";
import { useRequireAuth } from "@/lib/use-require-auth";
import type {
  Gym,
  Reservation,
  ReservationSlotAvailability,
  Sport,
} from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
};

type DateOption = {
  label: string;
  value: string;
};

type NoticeTone = "success" | "warning" | "error";

type SlotsState =
  | { status: "idle" }
  | {
      status: "ready";
      key: string;
      slots: Map<string, ReservationSlotAvailability>;
    }
  | { status: "error"; key: string; message: string };

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const unavailableTimeLabels = {
  "gym-mismatch": "선택 불가",
  "sport-unavailable": "종목 불가",
  "time-unavailable": "시간 불가",
  "invalid-date-time": "형식 오류",
  "past-time": "지난 시간",
  "closed-day": "휴관일",
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
  // /reserve/[gymId]?sport=&date=&time= 쿼리를 폼 초기 상태에 반영한다.
  // - 지원하지 않는 sport/time/date는 조용히 다른 유효 값으로 fallback하지 않고
  //   "쿼리만 무시"한다(기존 default가 그대로 적용됨).
  // - date는 YYYY-MM-DD 포맷을 우선 검사하고, dateOptions가 준비되면 7일 윈도우
  //   안쪽인지 1회 추가 검증한다(범위 밖이면 명시적으로 무시하고 안내).
  const searchParams = useSearchParams();
  const querySport = searchParams.get("sport");
  const queryDate = searchParams.get("date");
  const queryTime = searchParams.get("time");
  const initialSport: Sport = gym.sports.includes(querySport as Sport)
    ? (querySport as Sport)
    : gym.sports[0];
  const initialTime =
    queryTime && gym.availableTimes.includes(queryTime)
      ? queryTime
      : gym.availableTimes[0];
  const initialSelectedDate =
    queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : null;

  // 미로그인 시 /login?from=<현재 경로+쿼리> 로 redirect. 작업 3의 sport/date/time
  // 쿼리가 로그인 redirect 후에도 복원되도록 query를 통째로 from에 보존한다.
  const searchParamsQuery = searchParams.toString();
  const authFromPath = searchParamsQuery
    ? `/reserve/${gym.id}?${searchParamsQuery}`
    : `/reserve/${gym.id}`;
  useRequireAuth({ from: authFromPath });

  const [selectedSport, setSelectedSport] = useState<Sport>(initialSport);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate,
  );
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("success");
  const [noticeReservation, setNoticeReservation] =
    useState<Reservation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });
  const [slotsRefetchToken, setSlotsRefetchToken] = useState(0);
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
  const currentMinuteValue = useCurrentMinuteValue();
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

  // 쿼리로 받은 date가 7일 예약 가능 범위 안인지 dateOptions가 준비되는 시점에 1회만
  // 검증한다. 범위 밖이면 selectedDate를 null로 돌려 today가 표시되게 하고
  // 사용자가 의도와 다른 날짜를 모르고 submit하지 않도록 notice 영역에 안내한다.
  // ref가 1회만 통과시키므로 cascading render는 없다. set-state-in-effect 규칙은
  // 사용자 위치/권한 훅과 동일한 패턴으로 명시 disable한다.
  const queryDateCheckPendingRef = useRef(initialSelectedDate !== null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!queryDateCheckPendingRef.current) return;
    if (dateOptions.length === 0) return;
    queryDateCheckPendingRef.current = false;
    const isInWindow = dateOptions.some(
      (date) => date.value === initialSelectedDate,
    );
    if (!isInWindow) {
      setSelectedDate(null);
      setNotice(
        "선택한 날짜는 예약 가능 범위(7일) 밖이라 무시되었습니다. 다른 날짜를 선택해 주세요.",
      );
      setNoticeTone("warning");
    }
  }, [dateOptions, initialSelectedDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const slotsRequestKey =
    isDateReady && authSession.ok
      ? [
          gym.id,
          selectedSport,
          effectiveSelectedDate,
          String(slotsRefetchToken),
        ].join("__")
      : null;

  useEffect(() => {
    if (!slotsRequestKey) return;
    const controller = new AbortController();

    fetchReservationSlots({
      gymId: gym.id,
      sport: selectedSport,
      date: effectiveSelectedDate,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (result.ok) {
          setSlotsState({
            status: "ready",
            key: slotsRequestKey,
            slots: new Map(result.slots.map((slot) => [slot.time, slot])),
          });
        } else {
          setSlotsState({
            status: "error",
            key: slotsRequestKey,
            message: result.message,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const detail = error instanceof Error ? error.message : "";
        setSlotsState({
          status: "error",
          key: slotsRequestKey,
          message: `예약 가능 인원을 확인할 수 없습니다. ${detail}`.trim(),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    effectiveSelectedDate,
    gym.id,
    selectedSport,
    slotsRequestKey,
  ]);

  const slotsLookup =
    slotsState.status === "ready" && slotsState.key === slotsRequestKey
      ? slotsState.slots
      : null;
  const slotsFetchError =
    slotsState.status === "error" && slotsState.key === slotsRequestKey
      ? slotsState.message
      : null;
  const slotsFetchPending =
    Boolean(slotsRequestKey) && !slotsLookup && !slotsFetchError;
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
      gym.availableTimes.find((time) => {
        const isStaticallyAvailable = timeStates.get(time)?.available ?? false;
        if (!isStaticallyAvailable) return false;
        if (!slotsLookup) return false;
        return slotsLookup.get(time)?.status === "available";
      }) ?? null
    );
  }, [
    gym.availableTimes,
    hasReservationNotice,
    isDateReady,
    slotsLookup,
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
    (!selectedTimeStateCandidate.available ||
      slotsLookup?.get(selectedTime)?.status !== "available") &&
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
  const selectedSlot = slotsLookup?.get(effectiveSelectedTime) ?? null;
  const submitDisabledReason = isSubmitting
    ? "예약을 처리하고 있습니다."
    : !authSession.ok
      ? authSession.message
      : !isDateReady
        ? "예약 날짜를 준비하고 있습니다."
        : !reservationReadResult.ok
          ? reservationReadResult.message
          : !selectedTimeState.available
            ? selectedTimeState.message
            : slotsFetchPending || !slotsLookup
              ? "예약 가능 인원을 확인하고 있습니다."
                : slotsFetchError
                  ? slotsFetchError
                : selectedSlot && selectedSlot.status !== "available"
                  ? "선택한 시간대는 마감되었습니다."
                  : null;
  const timeSelectionDisabledLabel =
    (!authSession.ok && authSession.reason === "not-ready") ||
    (!reservationReadResult.ok && reservationReadResult.reason === "not-ready")
      ? "확인 중"
      : "확인 불가";
  const shouldShowSubmitDisabledReason =
    Boolean(submitDisabledReason) && !hasReservationNotice;
  const availableTimeCount = useMemo(() => {
    if (!isDateReady || timeSelectionDisabledReason || !slotsLookup) {
      return 0;
    }

    return gym.availableTimes.filter((time) => {
      if (!timeStates.get(time)?.available) return false;
      return slotsLookup.get(time)?.status === "available";
    }).length;
  }, [
    gym.availableTimes,
    isDateReady,
    slotsLookup,
    timeSelectionDisabledReason,
    timeStates,
  ]);
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
        setSlotsRefetchToken((token) => token + 1);
        return;
      }

      if (result.status === "duplicate") {
        setNoticeTone("warning");
        setNoticeReservation(result.reservation);
        setSelectedTime(result.reservation.time);
        return;
      }

      if (result.status === "full") {
        setNoticeTone("error");
        setNoticeReservation(null);
        // 다른 사용자가 같은 시간대를 채운 상황. 슬롯 목록을 다시 불러와 UI에 반영.
        setSlotsRefetchToken((token) => token + 1);
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
                    const slot = slotsLookup?.get(time) ?? null;
                    const isStaticallyAvailable = timeState.available;
                    const isClosed = slot?.status === "closed";
                    const isFull = slot?.status === "full";
                    const isSlotBlocked =
                      isStaticallyAvailable &&
                      (slotsFetchPending ||
                        Boolean(slotsFetchError) ||
                        isFull ||
                        isClosed);
                    const isDisabled =
                      Boolean(timeSelectionDisabledReason) ||
                      !isStaticallyAvailable ||
                      isSlotBlocked;
                    const timeButtonStateClass = (() => {
                      if (timeSelectionDisabledReason || isSlotBlocked) {
                        return "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
                      }
                      return getTimeButtonClass(timeState, isSelected);
                    })();
                    const timeLabel = (() => {
                      if (timeSelectionDisabledReason) {
                        return timeSelectionDisabledLabel;
                      }
                      if (!isStaticallyAvailable) {
                        return unavailableTimeLabels[timeState.reason];
                      }
                      if (slotsFetchPending) return "확인 중";
                      if (slotsFetchError) return "확인 불가";
                      if (isClosed) return "마감";
                      if (isFull) return "마감";
                      if (slot) return `잔여 ${slot.remaining}명`;
                      return null;
                    })();
                    const titleMessage = (() => {
                      if (timeSelectionDisabledReason)
                        return timeSelectionDisabledReason;
                      if (!isStaticallyAvailable) return timeState.message;
                      if (slotsFetchPending)
                        return "예약 가능 인원을 확인하고 있습니다.";
                      if (slotsFetchError) return slotsFetchError;
                      if (isClosed) return "운영자가 마감한 시간대입니다.";
                      if (isFull) return "이 시간대는 마감되었습니다.";
                      if (slot)
                        return `정원 ${slot.capacity}명 중 ${slot.remaining}명 예약 가능`;
                      return "예약 가능";
                    })();

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
                        title={titleMessage}
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
                ) : slotsFetchError ? (
                  <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">
                    {slotsFetchError}
                  </p>
                ) : slotsFetchPending ? (
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    예약 가능 인원을 확인하고 있습니다.
                  </p>
                ) : availableTimeCount === 0 ? (
                  <p className="mt-3 text-sm font-semibold text-amber-700" role="alert">
                    선택한 날짜에는 예약 가능한 시간이 없습니다. 다른 날짜를
                    선택해주세요.
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {availableTimeCount}개 시간대 예약 가능 · 마감/지난 시간/내
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
