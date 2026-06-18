"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  isInitialDateInWindow,
  resolveReservationFormInitial,
} from "@/lib/reservation-form-initial";
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

// 예약 불가 사유 → 번역 키 매핑. 라벨 텍스트는 messages의 Reserve.* 를 따른다.
const unavailableTimeLabelKeys = {
  "gym-mismatch": "unavailGymMismatch",
  "sport-unavailable": "unavailSportUnavailable",
  "time-unavailable": "unavailTimeUnavailable",
  "invalid-date-time": "unavailInvalidDateTime",
  "past-time": "unavailPastTime",
  "closed-day": "unavailClosedDay",
  "duplicate-active-reservation": "unavailDuplicate",
} as const;

const noticeStyles: Record<NoticeTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-error/30 bg-error/10 text-error",
};

const noticeLinkStyles: Record<NoticeTone, string> = {
  success: "bg-success text-white hover:bg-success/90",
  warning: "bg-warning text-white hover:bg-warning/90",
  error: "bg-error text-white hover:bg-error/90",
};

const reservationNoticeButtonStyles: Record<NoticeTone, string> = {
  success:
    "mt-6 h-11 w-full rounded-md bg-success px-5 text-sm font-semibold text-white transition disabled:cursor-default disabled:bg-success disabled:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  warning:
    "mt-6 h-11 w-full rounded-md bg-warning px-5 text-sm font-semibold text-white transition disabled:cursor-default disabled:bg-warning disabled:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  error:
    "mt-6 h-11 w-full rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
};

function createDateOptions(
  todayValue: string,
  locale: string,
  todayLabel: string,
  tomorrowLabel: string,
): DateOption[] {
  const [year, month, day] = todayValue.split("-").map(Number);
  const today = new Date(year, month - 1, day);
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "long" });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    const label =
      index === 0
        ? todayLabel
        : index === 1
          ? tomorrowLabel
          : weekdayFormatter.format(date);

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
      ? "border-accent bg-accent text-accent-ink"
      : "border-line-strong text-foreground hover:border-accent hover:text-accent-strong";
  }

  if (timeState.reason === "duplicate-active-reservation") {
    return "cursor-not-allowed border-accent/30 bg-accent-tint text-accent-strong";
  }

  if (timeState.reason === "past-time") {
    return "cursor-not-allowed border-line bg-surface-2 text-subtle";
  }

  return isSelected
    ? "cursor-not-allowed border-line bg-surface-2 text-subtle"
    : "cursor-not-allowed border-line bg-surface-2 text-subtle";
}

export function ReservationForm({ gym }: ReservationFormProps) {
  const t = useTranslations("Reserve");
  const locale = useLocale();
  // /reserve/[gymId]?sport=&date=&time= 쿼리를 폼 초기 상태에 반영한다.
  // 형식 검증과 sport/time 허용 여부는 resolveReservationFormInitial이 SSOT.
  // 7일 윈도우 검사는 dateOptions가 준비되는 시점에 isInitialDateInWindow로 한다.
  const searchParams = useSearchParams();
  const { initialSport, initialTime, initialSelectedDate } =
    resolveReservationFormInitial(gym, {
      sport: searchParams.get("sport"),
      date: searchParams.get("date"),
      time: searchParams.get("time"),
    });

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
  // 사용자가 시간 버튼을 직접 누른 적이 있는지 추적해서, 자동으로 다른 시간으로
  // 바뀌었을 때만 안내를 띄운다. 초기 진입 시 자동 전환은 안내하지 않아
  // 안내가 noisy해지지 않게 한다.
  const [userTouchedTime, setUserTouchedTime] = useState(false);
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
        ? createDateOptions(
            currentMinuteValue.slice(0, 10),
            locale,
            t("dateToday"),
            t("dateTomorrow"),
          )
        : [],
    [currentMinuteValue, locale, t],
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
    const inWindow = isInitialDateInWindow(
      initialSelectedDate,
      dateOptions.map((date) => date.value),
    );
    if (!inWindow) {
      setSelectedDate(null);
      setNotice(t("dateWindowWarning"));
      setNoticeTone("warning");
    }
  }, [dateOptions, initialSelectedDate, t]);
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
          message: t("slotsFetchError", { detail }).trim(),
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
    t,
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
  // auth/예약 read가 아직 준비되지 않은 전이적 로딩 상태(not-ready)인지.
  // 이 상태는 에러가 아니라 로딩이므로 중립 표시로 다룬다.
  const isReservationDataLoading =
    (!authSession.ok && authSession.reason === "not-ready") ||
    (!reservationReadResult.ok && reservationReadResult.reason === "not-ready");
  // 예약 버튼 비활성 사유 + 톤. "pending"은 전이적 로딩/대기(중립 표시),
  // "blocked"는 사용자가 조치해야 하는 실제 차단(에러 표시).
  // not-ready 같은 로딩 사유를 error-red로 보여주지 않는다.
  const submitDisabled: {
    message: string;
    tone: "pending" | "blocked";
  } | null = isSubmitting
    ? { message: t("submitProcessing"), tone: "pending" }
    : !authSession.ok
      ? {
          message: authSession.message,
          tone: authSession.reason === "not-ready" ? "pending" : "blocked",
        }
      : !isDateReady
        ? { message: t("datePreparing"), tone: "pending" }
        : !reservationReadResult.ok
          ? {
              message: reservationReadResult.message,
              tone:
                reservationReadResult.reason === "not-ready"
                  ? "pending"
                  : "blocked",
            }
          : !selectedTimeState.available
            ? { message: selectedTimeState.message, tone: "blocked" }
            : slotsFetchError
              ? { message: slotsFetchError, tone: "blocked" }
              : slotsFetchPending || !slotsLookup
                ? {
                    message: t("slotsChecking"),
                    tone: "pending",
                  }
                : selectedSlot && selectedSlot.status !== "available"
                  ? {
                      message: t("slotClosedSelected"),
                      tone: "blocked",
                    }
                  : null;
  const submitDisabledReason = submitDisabled?.message ?? null;
  const timeSelectionDisabledLabel = isReservationDataLoading
    ? t("timeLabelChecking")
    : t("timeLabelUnavailable");
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
    ? t("reserveProcessing")
    : hasReservationNotice
      ? noticeTone === "success"
        ? t("reserveDone")
        : t("reserveDuplicate")
      : t("reserveButton");
  const reserveButtonClass = hasReservationNotice
    ? reservationNoticeButtonStyles[noticeTone]
    : "mt-6 h-11 w-full rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

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
      setNotice(t("unexpectedError"));
      setNoticeTone("error");
      setNoticeReservation(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 가벼운 단계 표시. 현재 흐름(좌측 선택 → 우측 요약/제출 → 노티스)에 맞춰
  // 사용자의 진행 위치만 시각화한다. 멀티스텝 폼으로 변환하지 않는다.
  const reservationStep: 1 | 2 | 3 =
    hasReservationNotice && noticeTone === "success"
      ? 3
      : userTouchedTime && !submitDisabledReason && !hasReservationNotice
        ? 2
        : 1;
  const reservationSteps: { id: 1 | 2 | 3; label: string }[] = [
    { id: 1, label: t("stepInfo") },
    { id: 2, label: t("stepConfirm") },
    { id: 3, label: t("stepDone") },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <ol
        className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3 shadow-sm"
        aria-label={t("stepsAria")}
      >
        {reservationSteps.map((step, index) => {
          const isCurrent = reservationStep === step.id;
          const isDone = reservationStep > step.id;
          return (
            <li
              key={step.id}
              className="flex items-center gap-2"
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                  isDone
                    ? "border-accent bg-accent text-white"
                    : isCurrent
                      ? "border-accent bg-white text-accent-strong"
                      : "border-line-strong bg-white text-subtle"
                }`}
                aria-hidden="true"
              >
                {isDone ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </span>
              <span
                className={`text-sm font-semibold ${
                  isCurrent
                    ? "text-accent-strong"
                    : isDone
                      ? "text-accent-strong"
                      : "text-subtle"
                }`}
              >
                {step.label}
              </span>
              {index < reservationSteps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="ml-1 hidden h-px w-6 bg-line sm:inline-block"
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0 rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">
          {t("selectEyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{gym.name}</h1>
        <p className="mt-2 text-sm text-slate-600">{gym.address}</p>

        <div className="mt-7 grid min-w-0 gap-6">
          <fieldset>
            <legend className="text-sm font-bold text-slate-950">
              {t("sportLegend")}
            </legend>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label={t("sportSelectAria")}
            >
              {gym.sports.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  aria-pressed={selectedSport === sport}
                  onClick={() => {
                    setSelectedSport(sport);
                    resetNotice();
                  }}
                  className={`h-10 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    selectedSport === sport
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong text-muted hover:border-accent hover:text-accent-strong"
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-slate-950">
              {t("dateLegend")}
            </legend>
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
                    className={`min-w-0 rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                      effectiveSelectedDate === date.value
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line-strong text-muted hover:border-accent"
                    }`}
                  >
                    <span className="block font-semibold">{date.label}</span>
                    <span className="mt-1 block text-xs opacity-80">
                      {date.value}
                    </span>
                  </button>
                ))
              ) : (
                <div className="col-span-2 rounded-md border border-line bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500 sm:col-span-4">
                  {t("dateLoading")}
                </div>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-slate-950">
              {t("timeLegend")}
            </legend>
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
                        return "cursor-not-allowed border-line bg-surface-2 text-subtle";
                      }
                      return getTimeButtonClass(timeState, isSelected);
                    })();
                    const timeLabel = (() => {
                      if (timeSelectionDisabledReason) {
                        return timeSelectionDisabledLabel;
                      }
                      if (!isStaticallyAvailable) {
                        return t(unavailableTimeLabelKeys[timeState.reason]);
                      }
                      if (slotsFetchPending) return t("timeLabelChecking");
                      if (slotsFetchError) return t("timeLabelUnavailable");
                      if (isClosed) return t("timeClosed");
                      if (isFull) return t("timeFull");
                      if (slot)
                        return t("timeRemaining", { count: slot.remaining });
                      return null;
                    })();
                    const titleMessage = (() => {
                      if (timeSelectionDisabledReason)
                        return timeSelectionDisabledReason;
                      if (!isStaticallyAvailable) return timeState.message;
                      if (slotsFetchPending) return t("slotsChecking");
                      if (slotsFetchError) return slotsFetchError;
                      if (isClosed) return t("titleClosed");
                      if (isFull) return t("titleFull");
                      if (slot)
                        return t("titleSlot", {
                          capacity: slot.capacity,
                          remaining: slot.remaining,
                        });
                      return t("titleAvailable");
                    })();

                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isDisabled}
                        aria-pressed={!isDisabled && isSelected}
                        aria-label={`${time}${timeLabel ? ` - ${timeLabel}` : ` - ${t("timeAriaAvailable")}`}`}
                        onClick={() => {
                          setUserTouchedTime(true);
                          setSelectedTime(time);
                          resetNotice();
                        }}
                        className={`min-h-14 rounded-md border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${timeButtonStateClass}`}
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
                  isReservationDataLoading ? (
                    <p className="mt-3 text-xs leading-5 text-slate-500" role="status">
                      {timeSelectionDisabledReason}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-warning" role="alert">
                      {timeSelectionDisabledReason}
                    </p>
                  )
                ) : slotsFetchError ? (
                  <p className="mt-3 text-sm font-semibold text-error" role="alert">
                    {slotsFetchError}
                  </p>
                ) : slotsFetchPending ? (
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {t("slotsChecking")}
                  </p>
                ) : availableTimeCount === 0 ? (
                  <p className="mt-3 text-sm font-semibold text-warning" role="alert">
                    {t("noAvailableTimes")}
                  </p>
                ) : (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs leading-5 text-slate-500">
                      {t("availableCount", {
                        available: availableTimeCount,
                        total: gym.availableTimes.length,
                      })}
                    </p>
                    {userTouchedTime &&
                    !hasReservationNotice &&
                    selectedTime !== effectiveSelectedTime ? (
                      <p
                        className="text-xs font-semibold leading-5 text-warning"
                        role="status"
                      >
                        {t("timeAutoChanged", {
                          original: selectedTime,
                          effective: effectiveSelectedTime,
                        })}
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-3 rounded-md border border-line bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                {t("dateLoading")}
              </div>
            )}
          </fieldset>
        </div>
      </section>

      <aside className="min-w-0 rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-accent-strong">
          {t("summaryEyebrow")}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {t("summaryDesc")}
        </p>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("summaryGym")}</dt>
            <dd className="font-semibold text-slate-950">{gym.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("summarySport")}</dt>
            <dd className="font-semibold text-slate-950">{selectedSport}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("summaryDate")}</dt>
            <dd className="font-semibold text-slate-950">
              {effectiveSelectedDate || t("summaryDatePreparing")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">{t("summaryTime")}</dt>
            <dd className="font-semibold text-slate-950">
              {effectiveSelectedTime}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="font-bold text-slate-950">{t("summaryPrice")}</dt>
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

        {shouldShowSubmitDisabledReason && submitDisabled ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              submitDisabled.tone === "pending" ? "text-slate-500" : "text-error"
            }`}
            role={submitDisabled.tone === "pending" ? "status" : "alert"}
          >
            {submitDisabled.message}
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
                    <dt className="opacity-75">{t("noticeReservationNo")}</dt>
                    <dd className="mt-1 text-sm">
                      {noticeReservation.id.slice(0, 8)}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-75">{t("noticeGym")}</dt>
                    <dd className="mt-1 text-sm">{gym.name}</dd>
                  </div>
                  <div>
                    <dt className="opacity-75">{t("noticeSport")}</dt>
                    <dd className="mt-1 text-sm">{noticeReservation.sport}</dd>
                  </div>
                  <div>
                    <dt className="opacity-75">{t("noticeDateTime")}</dt>
                    <dd className="mt-1 text-sm">
                      {noticeReservation.date} {noticeReservation.time}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {noticeTone === "success" ? (
                    <Link
                      href={`/reservations/${noticeReservation.id}`}
                      aria-label={t("viewReservationDetailAria")}
                      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${noticeLinkStyles[noticeTone]}`}
                    >
                      {t("viewReservationDetail")}
                    </Link>
                  ) : null}
                  <Link
                    href="/reservations"
                    aria-label={t("viewMyReservationsAria")}
                    className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      noticeTone === "success"
                        ? "border-success/40 bg-white text-success hover:bg-success/10 focus-visible:ring-accent"
                        : noticeTone === "warning"
                          ? "border-warning/40 bg-white text-warning hover:bg-warning/10 focus-visible:ring-accent"
                          : "border-error/40 bg-white text-error hover:bg-error/10 focus-visible:ring-accent"
                    }`}
                  >
                    {t("viewMyReservations")}
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </aside>
      </div>
    </div>
  );
}
