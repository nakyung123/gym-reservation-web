"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  SPORT_MAX_PEOPLE,
  computeReservationPrice,
} from "@/lib/sport-capacity";
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
import { CollapsibleSection } from "@/components/collapsible-section";
import { AlertModal } from "@/components/alert-modal";
import type {
  Gym,
  PaymentMethod,
  Reservation,
  ReservationSlotAvailability,
  Sport,
} from "@/types/domain";

type ReservationFormProps = {
  gym: Gym;
};

type SlotsState =
  | { status: "idle" }
  | {
      status: "ready";
      key: string;
      slots: Map<string, ReservationSlotAvailability>;
    }
  | { status: "error"; key: string; message: string };

// 약관 동의 항목(모두 필수). 가입 단계에서 이미 동의받지만, 예약 시점 재확인용.
// content: 펼쳤을 때 노출되는 약관 본문(문단 배열).
const REQUIRED_TERMS = [
  {
    id: "privacy",
    label: "[필수] 예약 정보 및 개인정보 수집·이용 동의",
    content: [
      "(주)서울체육예약은 「개인정보 보호법」에 따라 체육시설 예약 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.",
      "1. 수집·이용 목적: 시설 예약 접수 및 관리, 예약 확인·취소, 현장 입장 시 본인 확인",
      "2. 수집 항목: 이름, 연락처, 생년월일, 예약 내역",
      "3. 보유·이용 기간: 예약 종료 후 관계 법령이 정한 기간 동안 보관한 뒤 파기",
      "4. 동의를 거부할 권리가 있으나, 거부 시 예약 서비스 이용이 제한될 수 있습니다.",
    ],
  },
  {
    id: "rules",
    label: "[필수] 시설 이용 규정 및 취소·환불 정책 동의",
    content: [
      "예약하신 시간과 용도 범위 안에서만 시설을 이용해야 하며, 시설·비품을 훼손한 경우 원상 복구 또는 그에 따른 비용이 부과될 수 있습니다.",
      "취소·환불 기준은 각 시설의 운영 정책을 따릅니다. 예약 전 2시간까지 마이페이지 예약 내역에서 취소할 수 있으며, 이후에는 취소가 제한될 수 있습니다.",
      "예약은 예약자 본인만 이용할 수 있으며 타인에게 양도·재판매할 수 없습니다. 현장에서 예약자 본인 확인을 요청할 수 있습니다.",
    ],
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

// 결제 수단(포트폴리오용 목업 — 실제 PG 연동 없음). 하나를 골라야 예약 신청이 활성화된다.
const PAYMENT_METHODS = [
  { id: "card", label: "카드결제" },
  { id: "easy-pay", label: "간편결제" },
  { id: "virtual-account", label: "가상계좌(무통장 입금)" },
] as const;

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

// 종목별 정원(인원 상한)·합산 청구가는 @/lib/sport-capacity가 SSOT다.
// 프론트(표시·전송)·서버(저장가 재계산)가 같은 모듈을 공유한다.

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
      {/* 라벨(예약자명·생년월일·연락처)은 검정, 실제 값은 네이비 */}
      <dt className="text-[16px] text-slate-900">{label}</dt>
      <dd className="text-[16px] font-bold text-accent-strong">{children}</dd>
    </div>
  );
}

// 우측 sticky 요약 패널의 한 줄 (라벨 좌 · 값 우). 패널 폭(378px)에 맞춘 compact row.
function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[14px] text-slate-900">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-slate-900">
        {value}
      </dd>
    </div>
  );
}

// 원형 체크 표시(프레젠테이션). 활성 시 네이비+흰 체크, 비활성 시 회색.
// 약관 동의 버튼과 종목 선택 리스트가 공유한다.
function CheckDot({ active }: { active: boolean }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full transition ${
        active ? "bg-accent text-white" : "bg-slate-200 text-slate-400"
      }`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M4 8.5l2.5 2.5L12 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// 접힌 섹션 요약 한 줄(라벨 좌 · 값 우, 네이비 강조).
function SummaryPeek({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-[16px] text-slate-900">
      <span>{label}</span>
      {/* 값(금액·날짜시간·명수)은 네이비 볼드 강조, 라벨은 검정 */}
      <span className="font-bold text-accent-strong">{value}</span>
    </div>
  );
}

// 단계 확정 버튼: 우측 선택완료. 누르면 현재 섹션을 접고 다음 섹션을 편다.
// divider: none=구분선 없음 / full=박스 끝까지 늘린 구분선(카드 px-8 상쇄).
function StepConfirm({
  onClick,
  divider = "none",
  error = false,
  label = "선택완료",
}: {
  onClick: () => void;
  divider?: "none" | "full";
  // 미확정 상태로 다음 단계를 시도했을 때 빨간 강조로 바꾼다.
  error?: boolean;
  label?: string;
}) {
  const dividerClass =
    divider === "full" ? "-mx-8 border-t border-slate-200 px-8 pt-6" : "";
  const buttonClass = error
    ? "border-error text-error hover:bg-error/5"
    : "border-accent text-accent-strong hover:bg-accent-tint";
  return (
    <div className={`mt-6 flex justify-end ${dividerClass}`}>
      <button
        type="button"
        onClick={onClick}
        className={`h-11 min-w-[92px] rounded-lg border px-4 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${buttonClass}`}
      >
        {label}
      </button>
    </div>
  );
}


// 약관 동의 원형 체크 버튼(클릭 토글).
function CircleCheck({
  checked,
  onClick,
  label,
  className,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      className={`shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        className ?? ""
      }`}
    >
      <CheckDot active={checked} />
    </button>
  );
}

// 약관 1건: 좌측 원형 체크(동의 토글) + 라벨 + 우측 펼침 토글. 펼치면 약관 본문이 나온다.
function TermItem({
  label,
  content,
  checked,
  onToggle,
}: {
  label: string;
  content: readonly string[];
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 약관 항목 박스(체크 + 라벨 + 펼침 토글). 박스 padding 16px, 체크원은 그 안에서 왼쪽 20px 띄움 */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
        <CircleCheck
          checked={checked}
          onClick={onToggle}
          label={`${label} 동의`}
          className="ml-5"
        />
        <span className="flex-1 text-[14px] text-slate-800">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="약관 내용 펼치기"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {/* CollapsibleSection과 동일한 ^ 아이콘·회전 규칙 */}
          <svg
            viewBox="0 0 16 16"
            className={`h-4 w-4 text-slate-400 transition-transform ${
              open ? "" : "rotate-180"
            }`}
            aria-hidden="true"
          >
            <path
              d="M3 10l5-5 5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {open ? (
        // 펼침 내용은 항목 박스와 분리된 별도 회색 박스.
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-4 text-[14px] leading-relaxed text-slate-600">
          {content.map((paragraph, index) => (
            <p key={paragraph} className={index === 0 ? "" : "mt-2"}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

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
  const [selectedSport, setSelectedSport] = useState<Sport | null>(
    initialSportParam ? initialSport : null,
  );
  // 종목 선택완료 여부(달력 조회 게이트). 딥링크면 확정 상태로 시작.
  const [sportConfirmed, setSportConfirmed] = useState(
    Boolean(initialSportParam),
  );
  // 선택완료 없이 달력 조회 시 선택완료 버튼을 빨갛게 강조.
  const [sportError, setSportError] = useState(false);
  // 페이지 공통 알림 모달 메시지(null이면 닫힘). 어떤 알림이든 이 채널로 띄운다.
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate,
  );
  const [selectedTime, setSelectedTime] = useState(initialTime);
  // 이용 인원(1~종목 정원). 종목 변경 시 정원 초과분은 onChange에서 clamp한다.
  const [people, setPeople] = useState(1);
  // 섹션 열림 상태(선택완료로 현재 접고 다음 펴는 단계 진행용).
  // 예약 일자는 처음 접힘 → 달력 조회하기(종목 확정 후)로 연다.
  // 초기 진입 시 예약 종목만 펼치고 나머지는 접는다. 선택완료로 다음 단계가 열린다.
  const [openSections, setOpenSections] = useState({
    sport: true,
    date: Boolean(initialSportParam),
    people: false,
    profile: false,
    terms: false,
    payment: false,
  });
  // 달력 조회하기가 한 번이라도 성공했는지. 성공 후에는 버튼을 다시 보이지 않는다.
  const [calendarRevealed, setCalendarRevealed] = useState(
    Boolean(initialSportParam),
  );
  // 이용 인원·예약자 정보 완료 여부. 완료해야 접힘 요약을 노출한다(초기엔 요약 없이 접힘).
  const [peopleConfirmed, setPeopleConfirmed] = useState(false);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [noticeReservation, setNoticeReservation] =
    useState<Reservation | null>(null);
  // 결제 수단(목업) 선택 · 제출 상태 · 완료된 예약 · 실패 사유.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Reservation | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });
  const [slotsRefetchToken] = useState(0);
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
    const max = new Date(year, month - 1 + 2, day);
    return `${max.getFullYear()}-${pad2(max.getMonth() + 1)}-${pad2(max.getDate())}`;
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
      setAlertMessage(
        "선택하신 날짜가 예약 가능 기간이 아니어서 오늘 날짜로 변경했습니다.",
      );
    }
  }, [isDateReady, selectedDate, todayValue, maxDateValue, gym]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 예약자 정보(프로필) 로드.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileState, setProfileState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  // 예약 연락처: 회원정보 연락처를 기본값으로 불러오되 이 예약 건에서 수정 가능.
  const [phoneInput, setPhoneInput] = useState("");
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
          // 연락처 입력칸 기본값 = 회원 연락처(없으면 빈칸, '-' 미표시).
          setPhoneInput(result.profile?.phone?.trim() ?? "");
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

  const slotsRequestKey =
    isDateReady && authSession.ok && selectedSport && selectedDate
      ? [gym.id, selectedSport, effectiveSelectedDate, String(slotsRefetchToken)].join(
          "__",
        )
      : null;

  useEffect(() => {
    if (!slotsRequestKey || !selectedSport) return;
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
  const reserveButtonLabel = isSubmitting ? "처리 중…" : t("reserveButton");
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
        },
      });

      if (result.ok) {
        setCompleted(result.reservation);
        return;
      }

      setSubmitError(result.message);
    } catch {
      setSubmitError(
        "예약 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 모든 필수 약관 동의가 완료되면 약관을 접고 결제 수단을 펼친다(다음 단계 자동 진행).
  function openPaymentIfAllAgreed(nextAgreed: Record<TermId, boolean>) {
    if (REQUIRED_TERMS.every((term) => nextAgreed[term.id])) {
      setOpenSections((s) => ({ ...s, terms: false, payment: true }));
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
          예약 신청 완료
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
            예약 신청이 완료되었습니다.
          </p>
          <p className="mt-3 text-[18px] leading-relaxed text-slate-500">
            마이페이지에서 QR 입장권과
            <br />
            상세 내역을 확인할 수 있습니다.
          </p>
          {/* 예약내역 보기 150.88×60 / 16px, 위 40px */}
          <Link
            href={`/reservations/${completed.id}/detail`}
            className="mt-10 inline-flex h-[60px] w-[150.88px] items-center justify-center rounded-full bg-accent text-[16px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            예약내역 보기
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
                aria-label="뒤로 가기"
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
              title="예약 종목"
              description="원하는 종목을 선택해 주세요."
              open={openSections.sport}
              onOpenChange={(v) =>
                setOpenSections((s) => ({ ...s, sport: v }))
              }
              summary={
                <SummaryPeek
                  label={selectedSport ?? "예약 종목"}
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
                        setSportConfirmed(false);
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
              error={sportError}
              onClick={() => {
                if (!selectedSport) {
                  setSportError(true);
                  setAlertMessage("예약 종목을 선택 완료해주세요.");
                  return;
                }
                // 종목 확정: 빨간 강조 해제 + 섹션 접어 요약 표시.
                setSportConfirmed(true);
                setSportError(false);
                setOpenSections((s) => ({ ...s, sport: false }));
              }}
            />
            </CollapsibleSection>

            {/* 달력 조회하기 — 종목 확정 후 예약 일자(달력)를 연다. 미확정 시 알림.
                한 번 조회에 성공하면 이후로는 버튼을 다시 보이지 않는다. */}
            {!calendarRevealed ? (
              <div className="my-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (!sportConfirmed) {
                      setSportError(true);
                      setAlertMessage("예약 종목을 선택 완료해주세요.");
                      return;
                    }
                    setCalendarRevealed(true);
                    // 캘린더를 열면서 오늘을 기본 선택 → 캘린더+시간대가 함께 노출된다.
                    if (todayValue) {
                      setSelectedDate((prev) => prev ?? todayValue);
                    }
                    setOpenSections((s) => ({ ...s, sport: false, date: true }));
                  }}
                  className="h-[52px] w-[150.88px] rounded-full bg-accent text-[16px] font-medium text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  달력 조회하기
                </button>
              </div>
            ) : (
              // 달력 조회에 성공한 뒤에만 예약 일자 섹션이 나타난다.
              <CollapsibleSection
                title="예약 일자"
              description="원하는 날짜를 선택하면 해당 날짜의 예약 가능 시간을 확인할 수 있습니다."
              open={openSections.date}
              onOpenChange={(v) => setOpenSections((s) => ({ ...s, date: v }))}
              summary={
                selectedDate ? (
                  <SummaryPeek
                    label="예약 일시"
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
            monthsAhead={2}
            isDateDisabled={(value) => isGymClosedOnDate(gym, value)}
            closedDaysText={
              gym.closedDays.length > 0
                ? gym.closedDays.join(", ")
                : "연중무휴"
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
                  선택 가능
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="size-2 rounded-full bg-slate-300" />
                  예약 마감
                </span>
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-4 gap-4">
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
              onClick={() =>
                setOpenSections((s) => ({ ...s, date: false, people: true }))
              }
            />
            </CollapsibleSection>
            )}

            {/* 이용 인원 */}
            <CollapsibleSection
              title="이용 인원"
              open={openSections.people}
              onOpenChange={(v) =>
                setOpenSections((s) => ({ ...s, people: v }))
              }
              summary={
                peopleConfirmed ? (
                  <SummaryPeek label="이용 인원" value={`${people}명`} />
                ) : undefined
              }
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-[16px] text-slate-900">
                  {selectedSport} 정원 {maxPeople}명
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPeople((prev) => Math.max(1, prev - 1));
                      resetNotice();
                    }}
                    disabled={people <= 1}
                    aria-label="인원 감소"
                    className="grid size-10 place-items-center rounded-md border border-slate-300 text-[20px] leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    −
                  </button>
                  <span className="w-14 text-center text-[16px] text-slate-800">
                    {people}명
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPeople((prev) => Math.min(maxPeople, prev + 1));
                      resetNotice();
                    }}
                    disabled={people >= maxPeople}
                    aria-label="인원 증가"
                    className="grid size-10 place-items-center rounded-md border border-slate-300 text-[20px] leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    +
                  </button>
                </div>
              </div>
              <StepConfirm
                onClick={() => {
                  setPeopleConfirmed(true);
                  setOpenSections((s) => ({
                    ...s,
                    people: false,
                    profile: true,
                  }));
                }}
              />
            </CollapsibleSection>

            {/* 예약자 정보 */}
            <CollapsibleSection
              title="예약자 정보"
              open={openSections.profile}
              onOpenChange={(v) =>
                setOpenSections((s) => ({ ...s, profile: v }))
              }
              summary={
                profileConfirmed ? (
                  <div className="flex flex-col gap-2">
                    <SummaryPeek label="예약자명" value={profileText.name} />
                    <SummaryPeek
                      label="생년월일"
                      value={profileText.birthDate}
                    />
                    <SummaryPeek label="연락처" value={phoneInput || "-"} />
                  </div>
                ) : undefined
              }
            >
            {profileState === "loading" || profileState === "idle" ? (
              <p className="text-sm text-slate-500">
                페이지를 불러오는 중입니다.
              </p>
            ) : profileState === "error" ? (
              <p className="text-sm font-semibold text-error" role="alert">
                예약자 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
              </p>
            ) : (
              <>
                <dl>
                  <Row label="예약자명">{profileText.name}</Row>
                  <Row label="생년월일">{profileText.birthDate}</Row>
                  {/* 연락처: 회원 연락처를 기본값으로 채우되 이 예약 건에서 수정 가능 */}
                  <div className="grid grid-cols-[160px_1fr] items-center gap-4 py-2.5">
                    <dt className="text-[16px] text-slate-900">연락처</dt>
                    <dd>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phoneInput}
                        onChange={(event) => setPhoneInput(event.target.value)}
                        placeholder="연락처를 입력해 주세요"
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-[16px] text-slate-900 transition focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                    </dd>
                  </div>
                </dl>
                {/* 입력완료 → 약관 동의 단계로 진행(위 구분선 포함) */}
                <StepConfirm
                  label="입력완료"
                  divider="full"
                  onClick={() => {
                    setProfileConfirmed(true);
                    setOpenSections((s) => ({
                      ...s,
                      profile: false,
                      terms: true,
                    }));
                  }}
                />
              </>
            )}
            </CollapsibleSection>

            {/* 약관 동의 — 원형 체크 + 펼침 본문 (이미지 패턴) */}
            <CollapsibleSection
              title="약관 동의"
              description="아래의 약관에 동의해 주세요."
              open={openSections.terms}
              onOpenChange={(v) => setOpenSections((s) => ({ ...s, terms: v }))}
            >
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
              <CircleCheck
                checked={allAgreed}
                onClick={toggleAllTerms}
                label="약관 전체 동의"
              />
              <span className="text-[14px] font-bold text-slate-900">
                예약 내용을 확인하였고, 모두 동의합니다.
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
                  />
                </li>
              ))}
            </ul>
            </CollapsibleSection>

            {/* 결제 수단 — 이 페이지에서 바로 결제(포트폴리오용 목업, 실 PG 없음) */}
            <CollapsibleSection
              title="결제 수단"
              open={openSections.payment}
              onOpenChange={(v) =>
                setOpenSections((s) => ({ ...s, payment: v }))
              }
            >
              {/* 결제 금액 박스 (네이비) */}
              <div className="flex h-[54px] items-center justify-between rounded-lg bg-accent-tint px-4">
                <span className="text-[16px] font-bold text-accent-strong">
                  결제 금액
                </span>
                <span className="text-[16px] font-bold text-accent-strong">
                  {formatGymPrice(totalPrice)}
                </span>
              </div>
              <p className="mt-4 text-[14px] text-slate-500">
                결제를 위한 수단을 선택해주세요.
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
                          {option.label}
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
                나의 예약 정보
              </h2>
              {/* 내용 줄 간격 8px(gap-2) */}
              <dl className="mt-4 flex flex-col gap-2">
                <SummaryLine label="체육관 이름" value={gym.name} />
                <SummaryLine label="이용일자" value={selectedDate || "-"} />
                <SummaryLine
                  label="이용회차"
                  value={selectedDate ? effectiveSelectedTime : "-"}
                />
                <SummaryLine label="취소기간" value="예약 전 2시간까지" />
              </dl>
            </div>

            {/* 결제 금액 */}
            <div className="rounded-2xl bg-white p-6">
              <h2 className="text-[24px] font-bold text-slate-900">결제 금액</h2>
              <dl className="mt-4 flex flex-col gap-2">
                <SummaryLine label="이용인원" value={`${people}명`} />
                <SummaryLine label="이용요금" value={formatGymPrice(price)} />
              </dl>
              {/* 이용요금 밑 구분선 (위·아래 간격 16px) */}
              <div className="mt-4 border-t border-slate-200" />
              {/* 총 결제 금액 — 연한 파랑 박스, 높이 54 */}
              <div className="mt-4 flex h-[54px] items-center justify-between rounded-lg bg-accent-tint px-4">
                <span className="text-[16px] font-bold text-accent-strong">
                  총 결제 금액
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
