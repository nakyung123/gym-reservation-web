import { describe, expect, it } from "vitest";
import {
  getUserReservationCancellationDeadline,
  isGymClosedOnDate,
  isValidReservationDateValue,
  validateUserReservationCancellation,
  validateReservationDraft,
} from "@/lib/reservation-rules";
import type { Gym, Reservation, ReservationDraft } from "@/types/domain";

const baseGym: Gym = {
  id: "gym-rules-test",
  name: "규칙 테스트 체육관",
  region: "서울 테스트구",
  address: "테스트로 1",
  officialUrl: "https://example.com",
  openHours: "09:00-22:00",
  basePrice: 10000,
  description: "예약 규칙 테스트용 체육관",
  distanceKm: 1,
  latitude: 37.5665,
  longitude: 126.978,
  sportPrices: { 배드민턴: 12000 },
  facilities: ["샤워실"],
  availableTimes: ["10:00", "11:00"],
  closedDays: [],
  sports: ["배드민턴"],
};

function draftFor(date: string): ReservationDraft {
  return {
    userId: "rules-user",
    gymId: baseGym.id,
    sport: "배드민턴",
    date,
    time: "10:00",
    price: 12000,
  };
}

function reservationFor(overrides: Partial<Reservation> = {}): Reservation {
  const draft = draftFor("2026-05-20");
  return {
    id: "rules-reservation",
    userId: draft.userId,
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
    time: draft.time,
    price: draft.price,
    status: "reserved",
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidReservationDateValue", () => {
  it("존재하는 날짜만 YYYY-MM-DD 예약 날짜로 인정한다", () => {
    expect(isValidReservationDateValue("2026-02-28")).toBe(true);
    expect(isValidReservationDateValue("2026-02-30")).toBe(false);
    expect(isValidReservationDateValue("2026/02/28")).toBe(false);
  });
});

describe("isGymClosedOnDate", () => {
  it("매주 휴관 요일을 판정한다", () => {
    const gym = { ...baseGym, closedDays: ["일요일"] };

    expect(isGymClosedOnDate(gym, "2026-05-17")).toBe(true);
    expect(isGymClosedOnDate(gym, "2026-05-18")).toBe(false);
  });

  it("둘째·넷째 같은 순번 요일 휴관을 판정한다", () => {
    const gym = { ...baseGym, closedDays: ["둘째·넷째 월요일"] };

    expect(isGymClosedOnDate(gym, "2026-05-11")).toBe(true);
    expect(isGymClosedOnDate(gym, "2026-05-18")).toBe(false);
    expect(isGymClosedOnDate(gym, "2026-05-25")).toBe(true);
  });

  it("주말 휴관을 토요일과 일요일에만 적용한다", () => {
    const gym = { ...baseGym, closedDays: ["주말"] };

    expect(isGymClosedOnDate(gym, "2026-05-16")).toBe(true);
    expect(isGymClosedOnDate(gym, "2026-05-17")).toBe(true);
    expect(isGymClosedOnDate(gym, "2026-05-18")).toBe(false);
  });

  it("공휴일 문구만으로는 일반 날짜를 휴관 처리하지 않는다", () => {
    const gym = { ...baseGym, closedDays: ["공휴일"] };

    expect(isGymClosedOnDate(gym, "2026-05-18")).toBe(false);
  });
});

describe("validateReservationDraft", () => {
  it("accepts a valid future reservation draft", () => {
    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: draftFor("2026-05-20"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a draft for a different gym", () => {
    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: { ...draftFor("2026-05-20"), gymId: "another-gym" },
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("gym-mismatch");
  });

  it("rejects a sport the gym does not expose", () => {
    const result = validateReservationDraft({
      gym: { ...baseGym, sports: [] },
      reservations: [],
      draft: draftFor("2026-05-20"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sport-unavailable");
  });

  it("rejects a time the gym does not expose", () => {
    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: { ...draftFor("2026-05-20"), time: "09:00" },
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("time-unavailable");
  });

  it("rejects invalid and past reservation date-times", () => {
    const invalid = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: draftFor("2026-02-30"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });
    const past = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: draftFor("2026-05-20"),
      now: new Date(2026, 4, 20, 10, 0, 0),
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reason).toBe("invalid-date-time");
    }
    expect(past.ok).toBe(false);
    if (!past.ok) {
      expect(past.reason).toBe("past-time");
    }
  });

  it("휴관일 예약을 rejected 규칙으로 차단한다", () => {
    const gym = { ...baseGym, closedDays: ["일요일"] };

    const result = validateReservationDraft({
      gym,
      reservations: [],
      draft: draftFor("2026-05-17"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("closed-day");
    expect(result.message).toBe("선택한 날짜는 체육관 휴관일입니다.");
  });

  it("rejects an active duplicate reservation and returns the matching reservation", () => {
    const duplicate = reservationFor();

    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [
        reservationFor({ id: "cancelled-duplicate", status: "cancelled" }),
        duplicate,
      ],
      draft: draftFor("2026-05-20"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("duplicate-active-reservation");
    expect(result.reservation).toBe(duplicate);
  });

  it("allows a draft when the only matching reservation is cancelled", () => {
    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [reservationFor({ status: "cancelled" })],
      draft: draftFor("2026-05-20"),
      now: new Date(2026, 4, 1, 0, 0, 0),
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateUserReservationCancellation", () => {
  it("사용자 취소 마감 시간을 이용 시작 2시간 전으로 계산한다", () => {
    const deadline = getUserReservationCancellationDeadline(
      draftFor("2026-05-20"),
    );

    expect(deadline?.getFullYear()).toBe(2026);
    expect(deadline?.getMonth()).toBe(4);
    expect(deadline?.getDate()).toBe(20);
    expect(deadline?.getHours()).toBe(8);
    expect(deadline?.getMinutes()).toBe(0);
  });

  it("이용 시작 2시간 전까지는 취소를 허용한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date(2026, 4, 20, 8, 0, 0),
    });

    expect(result.ok).toBe(true);
  });

  it("이용 시작 2시간이 지난 뒤에는 취소를 차단한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date(2026, 4, 20, 8, 1, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cancel-deadline-passed");
    expect(result.message).toBe("이용 시작 2시간 전까지만 취소할 수 있습니다.");
  });

  it("이미 시작된 예약은 취소를 차단한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date(2026, 4, 20, 10, 0, 0),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("past-time");
  });
});
