import type { Gym, Reservation, ReservationDraft } from "@/types/domain";

export type ReservationRuleFailure =
  | "gym-mismatch"
  | "sport-unavailable"
  | "time-unavailable"
  | "invalid-date-time"
  | "past-time"
  | "closed-day"
  | "duplicate-active-reservation";

export type ReservationRuleResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: ReservationRuleFailure;
      message: string;
      reservation?: Reservation;
    };

export type ReservationCancellationRuleFailure =
  | "invalid-date-time"
  | "past-time"
  | "cancel-deadline-passed";

export type ReservationCancellationRuleResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: ReservationCancellationRuleFailure;
      message: string;
    };

export type ReservationTimeState =
  | {
      available: true;
    }
  | {
      available: false;
      reason: ReservationRuleFailure;
      message: string;
      reservation?: Reservation;
    };

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

const reservationRuleMessages: Record<ReservationRuleFailure, string> = {
  "gym-mismatch": "선택한 체육관 정보가 예약 정보와 일치하지 않습니다.",
  "sport-unavailable": "선택한 종목은 이 체육관에서 예약할 수 없습니다.",
  "time-unavailable": "선택한 시간은 이 체육관에서 예약할 수 없습니다.",
  "invalid-date-time": "예약 날짜 또는 시간 형식이 올바르지 않습니다.",
  "past-time": "이미 지난 시간대는 예약할 수 없습니다.",
  "closed-day": "선택한 날짜는 체육관 휴관일입니다.",
  "duplicate-active-reservation":
    "이미 같은 조건의 예약이 있습니다. 내 예약 화면에서 확인해주세요.",
};

// 사용자 예약 취소 마감 = 이용 시작 기준 이 분(分) 이전까지.
// SSOT: 취소 정책의 단일 기준점. FAQ 안내봇(faq-knowledge.ts)도 이 값을 import해
// "n시간 전까지" 안내 문구를 생성하므로, 정책 변경 시 여기만 고치면 양쪽이 함께 바뀐다.
export const USER_CANCEL_CUTOFF_MINUTES = 120;

const reservationCancellationRuleMessages: Record<
  ReservationCancellationRuleFailure,
  string
> = {
  "invalid-date-time": "예약 날짜 또는 시간 형식이 올바르지 않습니다.",
  "past-time": "이미 시작된 예약은 취소할 수 없습니다.",
  "cancel-deadline-passed": `이용 시작 ${USER_CANCEL_CUTOFF_MINUTES / 60}시간 전까지만 취소할 수 있습니다.`,
};

export function getReservationRuleMessage(reason: ReservationRuleFailure) {
  return reservationRuleMessages[reason];
}

function fail(
  reason: ReservationRuleFailure,
  reservation?: Reservation,
): ReservationRuleResult {
  return {
    ok: false,
    reason,
    message: getReservationRuleMessage(reason),
    reservation,
  };
}

function cancelFail(
  reason: ReservationCancellationRuleFailure,
): ReservationCancellationRuleResult {
  return {
    ok: false,
    reason,
    message: reservationCancellationRuleMessages[reason],
  };
}

// 예약 date/time 문자열은 시설 운영 기준인 KST 벽시계로 해석한다.
// 이 모듈은 브라우저(임의 타임존)와 서버(Vercel=UTC) 양쪽에서 실행되므로,
// 로컬 타임존 기반 new Date(y, m, d, ...)를 쓰면 환경마다 판정이 달라진다
// (예: UTC 서버에서 취소 마감이 9시간 늦게 적용). 일일 리포트
// (src/lib/server/daily-report-format.ts)와 동일하게 KST 오프셋을 명시 적용한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type ParsedReservationDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  // KST 벽시계 (date, time)이 가리키는 절대 시각(UTC instant).
  instant: Date;
};

// (연, 1-indexed 월)의 마지막 날. Date.UTC(y, m, 0) = 다음 달 0일 = 이번 달 말일.
function daysInMonth(year: number, monthOneIndexed: number): number {
  return new Date(Date.UTC(year, monthOneIndexed, 0)).getUTCDate();
}

function parseReservationDateTime(
  dateValue: string,
  timeValue: string,
): ParsedReservationDateTime | null {
  const dateMatch = dateValue.match(datePattern);
  const timeMatch = timeValue.match(timePattern);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, yearValue, monthValue, dayValue] = dateMatch;
  const [, hourValue, minuteValue] = timeMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  // 달력 실재성 검증(예: 2026-02-30, 25:00 거부). 타임존 비의존 산술로만 판정한다.
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    instant: new Date(
      Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS,
    ),
  };
}

export function isValidReservationDateValue(dateValue: string) {
  return parseReservationDateTime(dateValue, "00:00") !== null;
}

const weekdayLabels = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];
const ordinalLabels = [
  "첫째",
  "둘째",
  "셋째",
  "넷째",
  "다섯째",
] as const;

function getWeekdayOrdinalInMonth(dayOfMonth: number) {
  return Math.floor((dayOfMonth - 1) / 7) + 1;
}

// 요일/순번은 달력 날짜만으로 결정되므로 타임존과 무관하게 UTC getter로 계산한다.
function isClosedDayRuleMatch(
  parsed: Pick<ParsedReservationDateTime, "year" | "month" | "day">,
  rule: string,
) {
  const normalizedRule = rule.trim();
  const day = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
  const weekdayLabel = weekdayLabels[day];
  const ordinal = getWeekdayOrdinalInMonth(parsed.day);
  const hasOrdinal = ordinalLabels.some((label) =>
    normalizedRule.includes(label),
  );

  if (normalizedRule === "주말") {
    return day === 0 || day === 6;
  }

  if (!normalizedRule.includes(weekdayLabel)) {
    return false;
  }

  if (!hasOrdinal) {
    return true;
  }

  const ordinalLabel = ordinalLabels[ordinal - 1];
  return Boolean(ordinalLabel && normalizedRule.includes(ordinalLabel));
}

export function isGymClosedOnDate(gym: Gym, dateValue: string) {
  const parsed = parseReservationDateTime(dateValue, "00:00");

  if (!parsed) {
    return false;
  }

  return gym.closedDays.some((rule) => isClosedDayRuleMatch(parsed, rule));
}

export function validateUserReservationCancellation({
  reservation,
  now = new Date(),
}: {
  reservation: Pick<Reservation, "date" | "time">;
  now?: Date;
}): ReservationCancellationRuleResult {
  const cancelDeadline = getUserReservationCancellationDeadline(reservation);

  if (!cancelDeadline) {
    return cancelFail("invalid-date-time");
  }

  const reservationDateTime = parseReservationDateTime(
    reservation.date,
    reservation.time,
  );

  if (!reservationDateTime) {
    return cancelFail("invalid-date-time");
  }

  if (reservationDateTime.instant.getTime() <= now.getTime()) {
    return cancelFail("past-time");
  }

  if (now.getTime() > cancelDeadline.getTime()) {
    return cancelFail("cancel-deadline-passed");
  }

  return { ok: true };
}

export function getUserReservationCancellationDeadline(
  reservation: Pick<Reservation, "date" | "time">,
) {
  const reservationDateTime = parseReservationDateTime(
    reservation.date,
    reservation.time,
  );

  if (!reservationDateTime) {
    return null;
  }

  return new Date(
    reservationDateTime.instant.getTime() -
      USER_CANCEL_CUTOFF_MINUTES * 60 * 1000,
  );
}

/**
 * 중복 판정 후보만 남긴다. findActiveDuplicate의 일치 조건에서 `time`만 제외한 것이다.
 *
 * 같은 (체육관·종목·날짜)에 대해 여러 시간대를 한 번에 판정할 때, 시간대마다 전체
 * 예약 목록을 훑으면 (시간대 수 × 예약 수)만큼 비교하게 된다. 이 함수로 먼저 좁히면
 * 한 번만 훑는다.
 *
 * 여기서 제외되는 예약은 `time`이 무엇이든 findActiveDuplicate에 걸릴 수 없으므로
 * 판정 결과는 좁히기 전과 동일하다. 이 동치성은 테스트로 잠가 둔다.
 */
export function filterActiveDuplicateCandidates(
  reservations: Reservation[],
  scope: Pick<ReservationDraft, "userId" | "gymId" | "sport" | "date">,
): Reservation[] {
  return reservations.filter(
    (reservation) =>
      reservation.status === "reserved" &&
      reservation.userId === scope.userId &&
      reservation.gymId === scope.gymId &&
      reservation.sport === scope.sport &&
      reservation.date === scope.date,
  );
}

function findActiveDuplicate(
  reservations: Reservation[],
  draft: ReservationDraft,
) {
  return reservations.find(
    (reservation) =>
      reservation.status === "reserved" &&
      reservation.userId === draft.userId &&
      reservation.gymId === draft.gymId &&
      reservation.sport === draft.sport &&
      reservation.date === draft.date &&
      reservation.time === draft.time,
  );
}

export function validateReservationDraft({
  gym,
  reservations,
  draft,
  now = new Date(),
}: {
  gym: Gym;
  reservations: Reservation[];
  draft: ReservationDraft;
  now?: Date;
}): ReservationRuleResult {
  if (draft.gymId !== gym.id) {
    return fail("gym-mismatch");
  }

  if (!gym.sports.includes(draft.sport)) {
    return fail("sport-unavailable");
  }

  if (!gym.availableTimes.includes(draft.time)) {
    return fail("time-unavailable");
  }

  const reservationDateTime = parseReservationDateTime(draft.date, draft.time);

  if (!reservationDateTime) {
    return fail("invalid-date-time");
  }

  if (reservationDateTime.instant.getTime() <= now.getTime()) {
    return fail("past-time");
  }

  if (isGymClosedOnDate(gym, draft.date)) {
    return fail("closed-day");
  }

  const duplicate = findActiveDuplicate(reservations, draft);

  if (duplicate) {
    return fail("duplicate-active-reservation", duplicate);
  }

  return {
    ok: true,
  };
}

export function getReservationTimeState({
  gym,
  reservations,
  draft,
  now = new Date(),
}: {
  gym: Gym;
  reservations: Reservation[];
  draft: ReservationDraft;
  now?: Date;
}): ReservationTimeState {
  const result = validateReservationDraft({
    gym,
    reservations,
    draft,
    now,
  });

  if (result.ok) {
    return {
      available: true,
    };
  }

  return {
    available: false,
    reason: result.reason,
    message: result.message,
    reservation: result.reservation,
  };
}
