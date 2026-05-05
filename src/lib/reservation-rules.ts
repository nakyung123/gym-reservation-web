import type { Gym, Reservation, ReservationDraft } from "@/types/domain";

export type ReservationRuleFailure =
  | "gym-mismatch"
  | "sport-unavailable"
  | "time-unavailable"
  | "invalid-date-time"
  | "past-time"
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
  "duplicate-active-reservation":
    "이미 같은 조건의 예약이 있습니다. 내 예약 화면에서 확인해주세요.",
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
