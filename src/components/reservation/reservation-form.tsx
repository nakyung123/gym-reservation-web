"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCurrentMinuteValue } from "@/hooks/use-current-minute";
import { useReservationSlots } from "@/hooks/use-reservation-slots";
import { useReservationProfile } from "@/hooks/use-reservation-profile";
import {
  createWizardInitialState,
  wizardReducer,
} from "@/components/reservation/reservation-wizard-reducer";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";
import { formatGymPrice, getGymSportPrice } from "@/lib/gym-utils";
import {
  SPORT_MAX_PEOPLE,
  computeReservationPrice,
} from "@/lib/sport-capacity";
import { createReservation } from "@/lib/reservation-service";
import { parsePhone } from "@/lib/user-profile";
import { resolveReservationFormInitial } from "@/lib/reservation-form-initial";
import {
  getReservationTimeState,
  isGymClosedOnDate,
  USER_CANCEL_CUTOFF_MINUTES,
  type ReservationTimeState,
} from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import { parseReservationSnapshot } from "@/lib/reservation-repository";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ReservationCalendar } from "@/components/reservation/reservation-calendar";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { AlertModal } from "@/components/ui/alert-modal";
import {
  CheckDot,
  CircleCheck,
  PAYMENT_METHODS,
  REQUIRED_TERMS,
  Row,
  StepConfirm,
  SummaryLine,
  SummaryPeek,
  TermItem,
  getTimeButtonClass,
  pad2,
  unavailableTimeLabelKeys,
  type TermId,
} from "@/components/reservation/reservation-form-parts";
import type { Gym, PaymentMethod, Reservation, Sport } from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
};

export function ReservationForm({ gym }: ReservationFormProps) {
  const t = useTranslations("Reserve");
  // /reserve/[gymId]?sport=&date=&time= 쿼리를 폼 초기 상태에 반영한다.
  // 형식 검증과 sport/time 허용 여부는 resolveReservationFormInitial이 SSOT.
  const searchParams = useSearchParams();
  const router = useRouter();
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

  // 처음엔 종목 미선택으로 시작. 딥링크(?sport=)로 들어오면 그 종목을 확정 상태로 편다.
  const initialSportParam = searchParams.get("sport");
  const hasInitialSport = Boolean(initialSportParam);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(
    initialSportParam ? initialSport : null,
  );
  // 단계 진행 상태(섹션 열림 + 종목/인원/정보 확정 플래그 + 종목 강조)는 wizardReducer가 SSOT.
  // "선택완료 → 현재 접고 다음 열기" 전이 규칙을 한곳에 모아 조합 실수를 막는다.
  const [wizard, dispatchWizard] = useReducer(
    wizardReducer,
    hasInitialSport,
    createWizardInitialState,
  );
  // 페이지 공통 알림 모달 메시지(null이면 닫힘). 어떤 알림이든 이 채널로 띄운다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate,
  );
  const [selectedTime, setSelectedTime] = useState(initialTime);
  // 이용 인원(1~종목 정원). 종목 변경 시 정원 초과분은 onChange에서 clamp한다.
  const [people, setPeople] = useState(1);
  const [noticeReservation, setNoticeReservation] =
    useState<Reservation | null>(null);
  // 결제 수단(목업) 선택 · 제출 상태 · 완료된 예약 · 실패 사유.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Reservation | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [userTouchedTime, setUserTouchedTime] = useState(false);
  // 약관 동의 상태(모두 필수). 모두 체크해야 예약 버튼이 활성화된다.
  const [agreed, setAgreed] = useState<Record<TermId, boolean>>({
    privacy: false,
    rules: false,
  });
  const allAgreed = REQUIRED_TERMS.every((term) => agreed[term.id]);

  const resetNotice = useCallback(() => {
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
    // +2개월. 대상 월에 같은 일자가 없으면(예: 12/31 → 2월) 말일로 clamp해
    // 달력 범위(monthsAhead=2)를 벗어나는 오버플로(2/31→3/3)를 막는다.
    let targetYear = year;
    let targetMonth = month + 2;
    if (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return `${targetYear}-${pad2(targetMonth)}-${pad2(Math.min(day, lastDay))}`;
  }, [todayValue]);

  const isDateReady = todayValue.length > 0;
  // 시간 그리드 계산용 기준 날짜. 실제 선택 전에는 오늘을 fallback으로만 쓴다(표시는 selectedDate 기준).
  const effectiveSelectedDate = selectedDate ?? todayValue;

  // 쿼리로 받은 날짜가 예약 가능 범위/휴관일인지 1회 검증한다. 범위 밖·휴관일이면
  // 오늘로 되돌린다. 미선택(null)이면 사용자가 달력에서 고를 때까지 그대로 둔다.
  const dateInitPendingRef = useRef(true);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!dateInitPendingRef.current) return;
    if (!isDateReady) return;
    dateInitPendingRef.current = false;

    if (selectedDate === null) {
      return;
    }
    const inRange =
      selectedDate >= todayValue && selectedDate <= maxDateValue;
    if (!inRange || isGymClosedOnDate(gym, selectedDate)) {
      setSelectedDate(todayValue);
      setAlertMessage(t("dateChangedAlert"));
    }
  }, [isDateReady, selectedDate, todayValue, maxDateValue, gym, t]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 예약자 정보(프로필) 로드. 연락처는 회원 정보를 기본값으로 채우되 편집 가능.
  const { profile, profileState, phoneInput, setPhoneInput } =
    useReservationProfile(reservationUserId);

  // 예약 완료 화면으로 전환되면 맨 위로 스크롤(제출 버튼 위치에 머물러 아래에서 나타나는 문제 방지).
  useEffect(() => {
    if (completed) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [completed]);

  const price = useMemo(
    () => (selectedSport ? getGymSportPrice(gym, selectedSport) : 0),
    [gym, selectedSport],
  );
  // 선택 종목의 정원(인원 상한)과 합산 금액(이용요금 × 인원). SSOT=sport-capacity.
  // 미선택 시 정원 1·금액 0으로 둔다.
  const maxPeople = selectedSport ? (SPORT_MAX_PEOPLE[selectedSport] ?? 1) : 1;
  const totalPrice = selectedSport
    ? computeReservationPrice(gym, selectedSport, people)
    : 0;

  const timeStates = useMemo<Map<string, ReservationTimeState>>(() => {
    if (!isDateReady || !authSession.ok || !selectedSport || !selectedDate) {
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
    selectedDate,
  ]);

  // 실시간 슬롯 가용성 조회는 use-reservation-slots 훅에 위임한다.
  // 선행 조건(날짜 준비·인증·종목/날짜 선택)이 모두 충족될 때만 조회한다.
  const { slotsLookup, slotsFetchError, slotsFetchPending } =
    useReservationSlots({
      gymId: gym.id,
      sport: selectedSport,
      date: effectiveSelectedDate,
      enabled: Boolean(
        isDateReady && authSession.ok && selectedSport && selectedDate,
      ),
      formatFetchError: (detail) => t("slotsFetchError", { detail }).trim(),
    });
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
        message: t("timeNotInList"),
      })
    : {
        available: false as const,
        reason: "invalid-date-time" as const,
        message: t("datePreparing"),
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
        message: t("timeNotInList"),
      })
    : selectedTimeStateCandidate;
  const selectedSlot = slotsLookup?.get(effectiveSelectedTime) ?? null;
  const isReservationDataLoading =
    (!authSession.ok && authSession.reason === "not-ready") ||
    (!reservationReadResult.ok && reservationReadResult.reason === "not-ready");
  const submitDisabled: {
    message: string;
    tone: "pending" | "blocked";
  } | null = !authSession.ok
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
  // 아직 날짜를 고르기 전(초기 진입 등)에는 차단 사유 텍스트를 띄우지 않는다.
  // (시간 미선택 등은 버튼 비활성만으로 충분 — 사용자가 아무것도 안 눌렀는데 에러가 뜨지 않게)
  const shouldShowSubmitDisabledReason =
    Boolean(submitDisabledReason) && !hasReservationNotice && Boolean(selectedDate);
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
    ? t("processingShort")
    : t("reserveButton");
  // 예약 버튼 비활성: 기존 차단 사유 + 약관 미동의 + 종목/날짜/결제수단 미선택 + 처리 중.
  // 종목·날짜·결제수단 미선택은 별도 안내 텍스트 없이 버튼 비활성만으로 처리한다.
  const reserveButtonDisabled =
    Boolean(submitDisabledReason) ||
    hasReservationNotice ||
    !allAgreed ||
    !selectedSport ||
    !selectedDate ||
    !paymentMethod ||
    isSubmitting;

  // 예약 신청하기 → 이 페이지에서 바로 예약 확정(생성). 포트폴리오용 데모라 실제 결제(PG)는 없다.
  // 성공 시 완료 화면으로 전환하고, 중복/마감/거절은 성공처럼 넘기지 않고 사유를 명시한다.
  const handleReserve = async () => {
    if (isSubmitting) return;
    if (!authSession.ok) {
      setSubmitError(authSession.message);
      return;
    }
    if (!selectedSport || !selectedDate || !paymentMethod) {
      return;
    }
    // 연락처는 선택 입력(빈칸 = 미기재)이지만, 입력한 경우 서버와 같은 규칙으로
    // 사전 검증해 400 왕복 없이 바로 안내한다(SSOT: user-profile parsePhone).
    const phoneParsed = parsePhone(phoneInput.trim() === "" ? null : phoneInput);
    if (!phoneParsed.ok) {
      setSubmitError(phoneParsed.message);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createReservation({
        gym,
        draft: {
          userId: reservationUserId,
          gymId: gym.id,
          sport: selectedSport,
          date: selectedDate,
          time: effectiveSelectedTime,
          // 합산가로 전송(api 경로에서는 서버가 people로 재계산).
          price: computeReservationPrice(gym, selectedSport, people),
          people,
          paymentMethod,
          phone: phoneParsed.value,
        },
      });

      if (result.ok) {
        setCompleted(result.reservation);
        return;
      }

      setSubmitError(result.message);
    } catch {
      setSubmitError(t("submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 모든 필수 약관 동의가 완료되면 약관을 접고 결제 수단을 펼친다(다음 단계 자동 진행).
  function openPaymentIfAllAgreed(nextAgreed: Record<TermId, boolean>) {
    if (REQUIRED_TERMS.every((term) => nextAgreed[term.id])) {
      dispatchWizard({ type: "OPEN_PAYMENT" });
    }
  }

  function toggleTerm(id: TermId) {
    const next = { ...agreed, [id]: !agreed[id] };
    setAgreed(next);
    openPaymentIfAllAgreed(next);
  }

  function toggleAllTerms() {
    const nextValue = !allAgreed;
    const next = { privacy: nextValue, rules: nextValue };
    setAgreed(next);
    openPaymentIfAllAgreed(next);
  }

  const profileText = {
    name: profile?.name?.trim() || "-",
    birthDate: profile?.birthDate?.trim() || "-",
  };

  // 예약 신청 완료 화면 — 성공 시 폼을 대체한다(중앙 제목 + 흰 박스 + 초록 체크).
  // 상단 네비와 60px·하단 푸터와 140px: main의 상하 패딩(py-8/12)을 -my로 상쇄 후 지정.
  if (completed) {
    return (
      <div className="mx-auto -my-8 w-[1200px] max-w-full pb-[116px] pt-[60px] sm:-my-12">
        {/* 제목 36px bold */}
        <h1 className="text-center text-[36px] font-bold text-slate-900">
          {t("completedTitle")}
        </h1>

        {/* 흰 박스 720×410, 제목과 32px */}
        <div className="mx-auto mt-8 flex h-[410px] w-[720px] max-w-full flex-col items-center justify-center rounded-2xl bg-white text-center">
          {/* 완료 체크 56×56 (#27AE60) */}
          <span className="grid size-14 place-items-center rounded-full bg-[#27AE60]">
            <svg
              viewBox="0 0 24 24"
              className="size-11 text-white"
              aria-hidden="true"
            >
              <path
                d="M5 12.5l4 4 10-10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {/* 24px, 위 32px / 아래 12px */}
          <p className="mt-8 text-[24px] font-bold text-slate-900">
            {t("completedMessage")}
          </p>
          <p className="mt-3 text-[18px] leading-relaxed text-slate-500">
            {t("completedSub1")}
            <br />
            {t("completedSub2")}
          </p>
          {/* 예약내역 보기 150.88×60 / 16px, 위 40px */}
          <Link
            href={`/reservations/${completed.id}/detail`}
            className="mt-10 inline-flex h-[60px] w-[150.88px] items-center justify-center rounded-full bg-accent text-[16px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t("completedViewLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[1200px] max-w-full">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* 좌측: 예약 정보 + 신청 버튼 */}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {/* 박스별 접기/펼치기 카드 스택 */}
          <div className="flex flex-col gap-5">
            {/* 시설명 (뒤로가기 + 시설명, 카드 박스) */}
            <div className="flex items-center gap-3 rounded-2xl bg-white px-8 py-6">
              <button
                type="button"
                onClick={() => router.back()}
                aria-label={t("backAria")}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-[20px] font-bold text-slate-900">
                {gym.name}
              </h1>
            </div>

            {/* 예약 종목 — 라디오형 리스트(단일 선택) */}
            <CollapsibleSection
              title={t("sportSectionTitle")}
              description={t("sportSectionDesc")}
              open={wizard.openSections.sport}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "sport", open: v })
              }
              summary={
                <SummaryPeek
                  label={selectedSport ?? t("sportSectionTitle")}
                  value={formatGymPrice(price)}
                />
              }
            >
            <ul className="flex flex-col gap-2">
              {gym.sports.map((sport) => {
                const active = selectedSport === sport;
                return (
                  <li key={sport}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSport(sport);
                        // 종목을 바꾸면 선택완료를 다시 눌러야 달력 조회 가능.
                        dispatchWizard({ type: "SELECT_SPORT" });
                        // 종목 변경 시 새 정원을 넘는 인원은 정원으로 내린다.
                        setPeople((prev) =>
                          Math.min(prev, SPORT_MAX_PEOPLE[sport] ?? 1),
                        );
                        resetNotice();
                      }}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                        active
                          ? "border-accent bg-accent-tint"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <CheckDot active={active} />
                      <span className="flex-1 text-[16px] font-medium text-slate-800">
                        {sport}
                      </span>
                      <span
                        className={`text-[16px] font-semibold ${
                          active ? "text-accent-strong" : "text-slate-600"
                        }`}
                      >
                        {formatGymPrice(getGymSportPrice(gym, sport))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <StepConfirm
              error={wizard.sportError}
              label={t("confirmSelect")}
              onClick={() => {
                if (!selectedSport) {
                  dispatchWizard({ type: "SPORT_ERROR" });
                  setAlertMessage(t("sportConfirmAlert"));
                  return;
                }
                // 종목 확정: 빨간 강조 해제 + 섹션 접어 요약 표시.
                dispatchWizard({ type: "CONFIRM_SPORT" });
              }}
            />
            </CollapsibleSection>

            {/* 달력 조회하기 — 종목 확정 후 예약 일자(달력)를 연다. 미확정 시 알림.
                한 번 조회에 성공하면 이후로는 버튼을 다시 보이지 않는다. */}
            {!wizard.calendarRevealed ? (
              <div className="my-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (!wizard.sportConfirmed) {
                      dispatchWizard({ type: "SPORT_ERROR" });
                      setAlertMessage(t("sportConfirmAlert"));
                      return;
                    }
                    // 캘린더를 열면서 오늘을 기본 선택 → 캘린더+시간대가 함께 노출된다.
                    if (todayValue) {
                      setSelectedDate((prev) => prev ?? todayValue);
                    }
                    dispatchWizard({ type: "REVEAL_CALENDAR" });
                  }}
                  className="h-[52px] w-[150.88px] rounded-full bg-accent text-[16px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {t("calendarReveal")}
                </button>
              </div>
            ) : (
              // 달력 조회에 성공한 뒤에만 예약 일자 섹션이 나타난다.
              <CollapsibleSection
                title={t("dateSectionTitle")}
              description={t("dateSectionDesc")}
              open={wizard.openSections.date}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "date", open: v })
              }
              summary={
                selectedDate ? (
                  <SummaryPeek
                    label={t("dateTimeSummaryLabel")}
                    value={`${selectedDate} ${effectiveSelectedTime}`}
                  />
                ) : undefined
              }
            >
            <div className="mx-auto w-full max-w-[752px]">
        {isDateReady ? (
          <ReservationCalendar
            selectedDate={selectedDate}
            todayValue={todayValue}
            maxDateValue={maxDateValue}
            isDateDisabled={(value) => isGymClosedOnDate(gym, value)}
            closedDaysText={
              gym.closedDays.length > 0
                ? gym.closedDays.join(", ")
                : t("closedDaysNone")
            }
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

            {/* 날짜를 고르기 전에는 시간대를 숨긴다(안내 텍스트 없이 예약하기 버튼 비활성만). */}
            {selectedDate ? (
              <fieldset className="mt-8">
                <legend className="text-[20px] font-bold text-slate-900">
                  {t("timeLegend")}
                </legend>
              {/* 범례: 선택 가능 · 예약 마감 */}
              <div className="mt-2 flex items-center gap-4 text-[13px]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <span className="size-2 rounded-full bg-slate-800" />
                  {t("legendAvailable")}
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="size-2 rounded-full bg-slate-300" />
                  {t("legendClosed")}
                </span>
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-4 gap-4">
                {gym.availableTimes.map((time) => {
                  const timeState = timeStates.get(time) ?? {
                    available: false as const,
                    reason: "time-unavailable" as const,
                    message: t("timeNotInList"),
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
                    // 잔여 인원 표시는 제외(예약 가능 슬롯은 시각만 노출).
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
                      {/* 라벨 없이 시각만 표시(마감·지난 시간은 회색 비활성으로 구분).
                          timeLabel은 aria-label(스크린리더)용으로만 유지한다. */}
                      <span className="block">{time}</span>
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
              </fieldset>
            ) : null}

            {/* 시간대 아래 구분선(박스 끝까지) + 선택완료(→ 이용 인원) */}
            <StepConfirm
              divider="full"
              label={t("confirmSelect")}
              onClick={() => dispatchWizard({ type: "CONFIRM_DATE" })}
            />
            </CollapsibleSection>
            )}

            {/* 이용 인원 */}
            <CollapsibleSection
              title={t("peopleSectionTitle")}
              open={wizard.openSections.people}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "people", open: v })
              }
              summary={
                wizard.peopleConfirmed ? (
                  <SummaryPeek
                    label={t("peopleSectionTitle")}
                    value={t("peopleValue", { count: people })}
                  />
                ) : undefined
              }
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-[16px] text-slate-900">
                  {selectedSport
                    ? t("peopleCapacity", { sport: selectedSport, max: maxPeople })
                    : null}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPeople((prev) => Math.max(1, prev - 1));
                      resetNotice();
                    }}
                    disabled={people <= 1}
                    aria-label={t("peopleDecreaseAria")}
                    className="grid size-10 place-items-center rounded-md border border-slate-300 text-[20px] leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    −
                  </button>
                  <span className="w-14 text-center text-[16px] text-slate-800">
                    {t("peopleValue", { count: people })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPeople((prev) => Math.min(maxPeople, prev + 1));
                      resetNotice();
                    }}
                    disabled={people >= maxPeople}
                    aria-label={t("peopleIncreaseAria")}
                    className="grid size-10 place-items-center rounded-md border border-slate-300 text-[20px] leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    +
                  </button>
                </div>
              </div>
              <StepConfirm
                label={t("confirmSelect")}
                onClick={() => dispatchWizard({ type: "CONFIRM_PEOPLE" })}
              />
            </CollapsibleSection>

            {/* 예약자 정보 */}
            <CollapsibleSection
              title={t("profileSectionTitle")}
              open={wizard.openSections.profile}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "profile", open: v })
              }
              summary={
                wizard.profileConfirmed ? (
                  <div className="flex flex-col gap-2">
                    <SummaryPeek
                      label={t("profileNameLabel")}
                      value={profileText.name}
                    />
                    <SummaryPeek
                      label={t("profileBirthLabel")}
                      value={profileText.birthDate}
                    />
                    <SummaryPeek
                      label={t("profilePhoneLabel")}
                      value={phoneInput || "-"}
                    />
                  </div>
                ) : undefined
              }
            >
            {profileState === "loading" || profileState === "idle" ? (
              <p className="text-sm text-slate-500">{t("profileLoading")}</p>
            ) : profileState === "error" ? (
              <p className="text-sm font-semibold text-error" role="alert">
                {t("profileError")}
              </p>
            ) : (
              <>
                <dl>
                  <Row label={t("profileNameLabel")}>{profileText.name}</Row>
                  <Row label={t("profileBirthLabel")}>
                    {profileText.birthDate}
                  </Row>
                  {/* 연락처: 회원 연락처를 기본값으로 채우되 이 예약 건에서 수정 가능 */}
                  <div className="grid grid-cols-[160px_1fr] items-center gap-4 py-2.5">
                    <dt className="text-[16px] text-slate-900">
                      {t("profilePhoneLabel")}
                    </dt>
                    <dd>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phoneInput}
                        onChange={(event) => setPhoneInput(event.target.value)}
                        placeholder={t("phonePlaceholder")}
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-[16px] text-slate-900 transition focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                    </dd>
                  </div>
                </dl>
                {/* 입력완료 → 약관 동의 단계로 진행(위 구분선 포함) */}
                <StepConfirm
                  label={t("confirmInput")}
                  divider="full"
                  onClick={() => dispatchWizard({ type: "CONFIRM_PROFILE" })}
                />
              </>
            )}
            </CollapsibleSection>

            {/* 약관 동의 — 원형 체크 + 펼침 본문 (이미지 패턴).
                약관 항목명·본문은 법적 고지라 번역하지 않고 국문을 유지한다. */}
            <CollapsibleSection
              title={t("termsSectionTitle")}
              description={t("termsSectionDesc")}
              open={wizard.openSections.terms}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "terms", open: v })
              }
            >
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
              <CircleCheck
                checked={allAgreed}
                onClick={toggleAllTerms}
                label={t("termsAllAria")}
              />
              <span className="text-[14px] font-bold text-slate-900">
                {t("termsAllAgree")}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {REQUIRED_TERMS.map((term) => (
                <li key={term.id}>
                  <TermItem
                    label={term.label}
                    content={term.content}
                    checked={agreed[term.id]}
                    onToggle={() => toggleTerm(term.id)}
                    expandAriaLabel={t("termsExpandAria")}
                  />
                </li>
              ))}
            </ul>
            </CollapsibleSection>

            {/* 결제 수단 — 이 페이지에서 바로 결제(포트폴리오용 목업, 실 PG 없음) */}
            <CollapsibleSection
              title={t("paymentSectionTitle")}
              open={wizard.openSections.payment}
              onOpenChange={(v) =>
                dispatchWizard({ type: "TOGGLE_SECTION", section: "payment", open: v })
              }
            >
              {/* 결제 금액 박스 (네이비) */}
              <div className="flex h-[54px] items-center justify-between rounded-lg bg-accent-tint px-4">
                <span className="text-[16px] font-bold text-accent-strong">
                  {t("paymentAmountLabel")}
                </span>
                <span className="text-[16px] font-bold text-accent-strong">
                  {formatGymPrice(totalPrice)}
                </span>
              </div>
              <p className="mt-4 text-[14px] text-slate-500">
                {t("paymentChoose")}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {PAYMENT_METHODS.map((option) => {
                  const active = paymentMethod === option.id;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod(option.id)}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                          active
                            ? "border-accent bg-accent-tint"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {/* 라디오 표시: 선택 시 두꺼운 accent 테두리 + 넉넉한 흰 속 */}
                        <span
                          className={`size-5 shrink-0 rounded-full bg-white ${
                            active
                              ? "border-[5px] border-accent"
                              : "border border-slate-300"
                          }`}
                        />
                        <span className="text-[16px] text-slate-900">
                          {t(option.labelKey)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleSection>
          </div>

      {/* 예약 신청 */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={handleReserve}
          disabled={reserveButtonDisabled}
          className="h-[52px] w-[151px] rounded-full bg-accent text-[16px] font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {reserveButtonLabel}
        </button>

        {submitError ? (
          <p
            className="w-full max-w-[520px] rounded-md border border-error/30 bg-error/10 p-3 text-center text-sm font-semibold text-error"
            role="alert"
          >
            {submitError}
          </p>
        ) : shouldShowSubmitDisabledReason && submitDisabled ? (
          <p
            className={`text-sm font-semibold ${
              submitDisabled.tone === "pending" ? "text-slate-500" : "text-error"
            }`}
            role={submitDisabled.tone === "pending" ? "status" : "alert"}
          >
            {submitDisabled.message}
          </p>
        ) : null}
          </div>
        </div>

        {/* 우측: 나의 예약 정보 요약 (스크롤 따라오는 sticky) */}
        <aside className="w-full lg:sticky lg:top-24 lg:w-[378px] lg:shrink-0 lg:self-start">
          <div className="flex flex-col gap-5">
            {/* 나의 예약 정보 */}
            <div className="rounded-2xl bg-white p-6">
              <h2 className="text-[24px] font-bold text-slate-900">
                {t("sidebarTitle")}
              </h2>
              {/* 내용 줄 간격 8px(gap-2) */}
              <dl className="mt-4 flex flex-col gap-2">
                <SummaryLine label={t("sidebarGymLabel")} value={gym.name} />
                <SummaryLine
                  label={t("sidebarDateLabel")}
                  value={selectedDate || "-"}
                />
                <SummaryLine
                  label={t("sidebarTimeLabel")}
                  value={selectedDate ? effectiveSelectedTime : "-"}
                />
                <SummaryLine
                  label={t("sidebarCancelLabel")}
                  value={t("cancelWindowValue", {
                    hours: USER_CANCEL_CUTOFF_MINUTES / 60,
                  })}
                />
              </dl>
            </div>

            {/* 결제 금액 */}
            <div className="rounded-2xl bg-white p-6">
              <h2 className="text-[24px] font-bold text-slate-900">
                {t("paySummaryTitle")}
              </h2>
              <dl className="mt-4 flex flex-col gap-2">
                <SummaryLine
                  label={t("payPeopleLabel")}
                  value={t("peopleValue", { count: people })}
                />
                <SummaryLine
                  label={t("payFeeLabel")}
                  value={formatGymPrice(price)}
                />
              </dl>
              {/* 이용요금 밑 구분선 (위·아래 간격 16px) */}
              <div className="mt-4 border-t border-slate-200" />
              {/* 총 결제 금액 — 연한 파랑 박스, 높이 54 */}
              <div className="mt-4 flex h-[54px] items-center justify-between rounded-lg bg-accent-tint px-4">
                <span className="text-[16px] font-bold text-accent-strong">
                  {t("payTotalLabel")}
                </span>
                <span className="text-[16px] font-bold text-accent-strong">
                  {formatGymPrice(totalPrice)}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* 페이지 공통 알림 모달 (312×186, 중앙). 메시지에 따라 어떤 알림이든 이 창을 쓴다. */}
      {alertMessage ? (
        <AlertModal
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      ) : null}
    </div>
  );
}
