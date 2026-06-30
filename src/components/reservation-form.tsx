"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCurrentMinuteValue } from "@/hooks/use-current-minute";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice, getGymSportPrice } from "@/lib/gym-utils";
import { createReservation } from "@/lib/reservation-service";
import { resolveReservationFormInitial } from "@/lib/reservation-form-initial";
import {
  getReservationTimeState,
  isGymClosedOnDate,
  type ReservationTimeState,
} from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { fetchReservationSlots } from "@/lib/reservation-slot-availability";
import { fetchUserProfile } from "@/lib/user-profile-client";
import type { UserProfile } from "@/lib/user-profile";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ReservationCalendar } from "@/components/reservation-calendar";
import type {
  Gym,
  Reservation,
  ReservationSlotAvailability,
  Sport,
} from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
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

// 약관 동의 항목(모두 필수). 가입 단계에서 이미 동의받지만, 예약 시점 재확인용.
const REQUIRED_TERMS = [
  {
    id: "privacy",
    label: "[필수] 예약 정보 및 개인정보 수집·이용 동의",
  },
  {
    id: "rules",
    label: "[필수] 시설 이용 규정 및 취소·환불 정책 동의",
  },
] as const;

type TermId = (typeof REQUIRED_TERMS)[number]["id"];

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

  return "cursor-not-allowed border-line bg-surface-2 text-subtle";
}

// 예약 상세 페이지(reservation-receipt-view)와 동일한 섹션 헤더:
// 제목(20px) + 하단 보더 + 펼침 상태를 나타내는 장식용 ^ 아이콘.
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
      <h2 className="text-[20px] font-bold text-slate-900">{title}</h2>
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-slate-400" aria-hidden="true">
        <path
          d="M3 10l5-5 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// 라벨(좌, 회색) + 값(우) 한 줄. 예약 상세 페이지와 동일.
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2.5">
      <dt className="text-[14px] text-slate-500">{label}</dt>
      <dd className="text-[14px] font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function ReservationForm({ gym }: ReservationFormProps) {
  const t = useTranslations("Reserve");
  // /reserve/[gymId]?sport=&date=&time= 쿼리를 폼 초기 상태에 반영한다.
  // 형식 검증과 sport/time 허용 여부는 resolveReservationFormInitial이 SSOT.
  const searchParams = useSearchParams();
  const { initialSport, initialTime, initialSelectedDate } =
    resolveReservationFormInitial(gym, {
      sport: searchParams.get("sport"),
      date: searchParams.get("date"),
      time: searchParams.get("time"),
    });

  // 미로그인 시 /login?from=<현재 경로+쿼리> 로 redirect. sport/date/time 쿼리가
  // 로그인 redirect 후에도 복원되도록 query를 통째로 from에 보존한다.
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
  const [userTouchedTime, setUserTouchedTime] = useState(false);
  // 약관 동의 상태(모두 필수). 모두 체크해야 예약 버튼이 활성화된다.
  const [agreed, setAgreed] = useState<Record<TermId, boolean>>({
    privacy: false,
    rules: false,
  });
  const allAgreed = REQUIRED_TERMS.every((term) => agreed[term.id]);

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

  // 오늘 날짜(YYYY-MM-DD)와 예약 가능 마지막 날짜(오늘 +2개월).
  const todayValue = currentMinuteValue ? currentMinuteValue.slice(0, 10) : "";
  const maxDateValue = useMemo(() => {
    if (!todayValue) return "";
    const [year, month, day] = todayValue.split("-").map(Number);
    const max = new Date(year, month - 1 + 2, day);
    return `${max.getFullYear()}-${pad2(max.getMonth() + 1)}-${pad2(max.getDate())}`;
  }, [todayValue]);

  const isDateReady = todayValue.length > 0;
  // 날짜 미선택 시 오늘을 기본으로 사용한다(시간 그리드가 항상 기준 날짜를 갖도록).
  const effectiveSelectedDate = selectedDate ?? todayValue;

  // 쿼리로 받은 날짜가 예약 가능 범위/휴관일인지 1회 검증한다. 범위 밖·휴관일이면
  // 오늘로 되돌리고, 미선택이면 오늘로 채운다. ref가 1회만 통과시켜 cascading은 없다.
  const dateInitPendingRef = useRef(true);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!dateInitPendingRef.current) return;
    if (!isDateReady) return;
    dateInitPendingRef.current = false;

    if (selectedDate === null) {
      setSelectedDate(todayValue);
      return;
    }
    const inRange =
      selectedDate >= todayValue && selectedDate <= maxDateValue;
    if (!inRange || isGymClosedOnDate(gym, selectedDate)) {
      setSelectedDate(todayValue);
      setNotice("선택하신 날짜가 예약 가능 기간이 아니어서 오늘 날짜로 변경했습니다.");
      setNoticeTone("warning");
    }
  }, [isDateReady, selectedDate, todayValue, maxDateValue, gym]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 예약자 정보(프로필) 로드.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileState, setProfileState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  useEffect(() => {
    if (!reservationUserId) return;
    const controller = new AbortController();
    // 조회 시작 즉시 로딩 표시(외부 fetch 동기화 목적의 의도적 set).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileState("loading");
    fetchUserProfile(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setProfile(result.profile);
          setProfileState("ready");
        } else {
          setProfileState("error");
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setProfileState("error");
      });
    return () => controller.abort();
  }, [reservationUserId]);

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
      ? [gym.id, selectedSport, effectiveSelectedDate, String(slotsRefetchToken)].join(
          "__",
        )
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
  }, [effectiveSelectedDate, gym.id, selectedSport, slotsRequestKey, t]);

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
  const isReservationDataLoading =
    (!authSession.ok && authSession.reason === "not-ready") ||
    (!reservationReadResult.ok && reservationReadResult.reason === "not-ready");
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
                ? { message: t("slotsChecking"), tone: "pending" }
                : selectedSlot && selectedSlot.status !== "available"
                  ? { message: t("slotClosedSelected"), tone: "blocked" }
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
  // 예약 버튼 비활성: 기존 차단 사유 + 약관 미동의 + 이미 처리된 안내.
  const reserveButtonDisabled =
    Boolean(submitDisabledReason) || hasReservationNotice || !allAgreed;

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

  function toggleTerm(id: TermId) {
    setAgreed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllTerms() {
    const next = !allAgreed;
    setAgreed({ privacy: next, rules: next });
  }

  const profileText = {
    name: profile?.name?.trim() || "-",
    birthDate: profile?.birthDate?.trim() || "-",
    phone: profile?.phone?.trim() || "-",
  };
  const profileIncomplete =
    profileState === "ready" &&
    (!profile?.name || !profile?.phone);

  return (
    <div className="mx-auto flex w-[1200px] max-w-full flex-col gap-8">
      {/* 상단 배너 — 예약 상세 페이지와 동일한 브랜드 네이비 */}
      <header className="flex h-40 items-center rounded-2xl bg-accent px-12 text-white shadow-sm">
        <div>
          <h1 className="text-[32px] font-bold leading-tight">예약하기</h1>
          <p className="mt-2 text-[20px] text-white/85">
            원하는 날짜와 시간을 선택해 예약을 신청하세요
          </p>
        </div>
      </header>

      {/* 본문 박스 */}
      <section className="rounded-2xl bg-white px-12 py-12 shadow-sm">
        <h2 className="text-[28px] font-bold text-slate-900">{gym.name}</h2>
        <p className="mt-2 text-[16px] text-slate-500">
          예약 정보를 확인하고 신청해 주세요.
        </p>

        <div className="mt-10 flex flex-col gap-12">
          {/* 예약 종목 */}
          <div>
            <SectionHeader title="예약 종목" />
            <dl className="mt-4">
              <Row label="종목 선택">
                <select
                  value={selectedSport}
                  onChange={(event) => {
                    setSelectedSport(event.target.value as Sport);
                    resetNotice();
                  }}
                  className="h-10 min-w-40 rounded-md border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-800 transition focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {gym.sports.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))}
                </select>
              </Row>
              {gym.sports.length > 1 ? (
                gym.sports.map((sport) => (
                  <Row key={sport} label={sport}>
                    {formatGymPrice(getGymSportPrice(gym, sport))}
                  </Row>
                ))
              ) : (
                <Row label="이용 요금">
                  <span className="font-bold text-accent-strong">
                    {formatGymPrice(price)}
                  </span>
                </Row>
              )}
            </dl>
          </div>

          {/* 예약 일자 */}
          <div>
            <SectionHeader title="예약 일자" />
            <p className="mt-4 text-[14px] text-slate-500">
              원하는 날짜를 선택하면 해당 날짜의 예약 가능 시간을 확인할 수 있습니다.
            </p>
            <div className="mx-auto mt-6 max-w-md">
        {isDateReady ? (
          <ReservationCalendar
            selectedDate={selectedDate}
            todayValue={todayValue}
            monthsAhead={2}
            isDateDisabled={(value) => isGymClosedOnDate(gym, value)}
            onSelect={(value) => {
              setSelectedDate(value);
              resetNotice();
            }}
          />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-400">
            {t("dateLoading")}
          </div>
        )}
            </div>

            <fieldset className="mt-8 border-t border-slate-200 pt-6">
              <legend className="text-[15px] font-bold text-slate-900">
                {t("timeLegend")}
              </legend>
          {isDateReady ? (
            <>
              <div className="mt-4 grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-5">
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
                    if (slot) return t("timeRemaining", { count: slot.remaining });
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
            <div className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-3 text-sm font-semibold text-subtle">
              {t("dateLoading")}
            </div>
          )}
            </fieldset>
          </div>

          {/* 예약자 정보 */}
          <div>
            <SectionHeader title="예약자 정보" />
            {profileState === "loading" || profileState === "idle" ? (
              <p className="mt-4 text-sm text-slate-500">
                예약자 정보를 불러오는 중입니다…
              </p>
            ) : profileState === "error" ? (
              <p className="mt-4 text-sm font-semibold text-error" role="alert">
                예약자 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
              </p>
            ) : (
              <>
                <dl className="mt-4">
                  <Row label="예약자명">{profileText.name}</Row>
                  <Row label="생년월일">{profileText.birthDate}</Row>
                  <Row label="연락처">{profileText.phone}</Row>
                </dl>
                {profileIncomplete ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-warning">
                    예약자 정보가 비어 있습니다.{" "}
                    <Link
                      href="/mypage"
                      className="font-semibold underline underline-offset-2"
                    >
                      마이페이지
                    </Link>
                    에서 정보를 입력해 주세요.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* 약관 동의 */}
          <div>
            <SectionHeader title="약관 동의" />
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={toggleAllTerms}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="text-[15px] font-bold text-slate-900">
                예약 내용을 확인하였고, 모두 동의합니다.
              </span>
            </label>
            <ul className="mt-3 flex flex-col gap-2">
              {REQUIRED_TERMS.map((term) => (
                <li key={term.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={agreed[term.id]}
                      onChange={() => toggleTerm(term.id)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <span className="text-[14px] text-slate-800">{term.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!allAgreed ? (
              <p className="mt-3 text-[13px] font-semibold text-slate-500">
                필수 약관에 모두 동의하시면 예약을 신청할 수 있습니다.
              </p>
            ) : null}
          </div>

          {/* 결제 내역 */}
          <div>
            <SectionHeader title="결제 내역" />
            <dl className="mt-4">
              <Row label="예약 일시">
                {effectiveSelectedDate || t("summaryDatePreparing")}{" "}
                {effectiveSelectedTime}
              </Row>
              <div className="mt-1 grid grid-cols-[160px_1fr] gap-4 rounded-lg bg-slate-50 px-4 py-3">
                <dt className="self-center text-[14px] text-slate-500">
                  현장 결제 예정 금액
                </dt>
                <dd className="self-center text-[16px] font-bold text-accent-strong">
                  {formatGymPrice(price)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* 예약 신청 */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={handleReserve}
          disabled={reserveButtonDisabled}
          className="h-14 w-full max-w-90 rounded-full bg-accent text-[18px] font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {reserveButtonLabel}
        </button>

        {shouldShowSubmitDisabledReason && submitDisabled ? (
          <p
            className={`text-sm font-semibold ${
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
            className={`w-full rounded-md border p-4 text-sm font-semibold ${noticeStyles[noticeTone]}`}
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
                      href={`/reservations/${noticeReservation.id}/detail`}
                      target="_blank"
                      rel="noopener noreferrer"
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
      </div>
    </div>
  );
}
