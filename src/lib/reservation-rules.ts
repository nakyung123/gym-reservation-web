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

const USER_CANCEL_CUTOFF_MINUTES = 120;

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

function parseReservationDateTime(dateValue: string, timeValue: string) {
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
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
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

function getWeekdayOrdinalInMonth(date: Date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function isClosedDayRuleMatch(date: Date, rule: string) {
  const normalizedRule = rule.trim();
  const day = date.getDay();
  const weekdayLabel = weekdayLabels[day];
  const ordinal = getWeekdayOrdinalInMonth(date);
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
  const parsedDate = parseReservationDateTime(dateValue, "00:00");

  if (!parsedDate) {
    return false;
  }

  return gym.closedDays.some((rule) => isClosedDayRuleMatch(parsedDate, rule));
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

  if (reservationDateTime.getTime() <= now.getTime()) {
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

  const cancelDeadline = new Date(reservationDateTime);
  cancelDeadline.setMinutes(
    cancelDeadline.getMinutes() - USER_CANCEL_CUTOFF_MINUTES,
  );

  return cancelDeadline;
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

  if (reservationDateTime.getTime() <= now.getTime()) {
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
