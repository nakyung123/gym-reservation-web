import { describe, expect, it } from "vitest";
import {
  filterActiveDuplicateCandidates,
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
    paymentMethod: null,
    phone: null,
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
      now: new Date("2026-05-01T00:00:00+09:00"),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a draft for a different gym", () => {
    const result = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: { ...draftFor("2026-05-20"), gymId: "another-gym" },
      now: new Date("2026-05-01T00:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
    });
    const past = validateReservationDraft({
      gym: baseGym,
      reservations: [],
      draft: draftFor("2026-05-20"),
      now: new Date("2026-05-20T10:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
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
      now: new Date("2026-05-01T00:00:00+09:00"),
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateUserReservationCancellation", () => {
  it("사용자 취소 마감 시간을 이용 시작 2시간 전으로 계산한다", () => {
    const deadline = getUserReservationCancellationDeadline(
      draftFor("2026-05-20"),
    );

    // KST 2026-05-20 10:00 시작 → 마감 = KST 08:00 = UTC 2026-05-19 23:00.
    expect(deadline?.toISOString()).toBe("2026-05-19T23:00:00.000Z");
  });

  it("이용 시작 2시간 전까지는 취소를 허용한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date("2026-05-20T08:00:00+09:00"),
    });

    expect(result.ok).toBe(true);
  });

  it("이용 시작 2시간이 지난 뒤에는 취소를 차단한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date("2026-05-20T08:01:00+09:00"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cancel-deadline-passed");
    expect(result.message).toBe("이용 시작 2시간 전까지만 취소할 수 있습니다.");
  });

  it("이미 시작된 예약은 취소를 차단한다", () => {
    const result = validateUserReservationCancellation({
      reservation: draftFor("2026-05-20"),
      now: new Date("2026-05-20T10:00:00+09:00"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("past-time");
  });
});

describe("filterActiveDuplicateCandidates", () => {
  const scope = {
    userId: "rules-user",
    gymId: baseGym.id,
    sport: "배드민턴" as const,
    date: "2026-05-20",
  };

  // 좁히기에서 제외되어야 하는 예약들. 각각 조건 하나씩만 어긋난다.
  const excluded: Reservation[] = [
    reservationFor({ id: "other-status", status: "cancelled" }),
    reservationFor({ id: "other-status-used", status: "used" }),
    reservationFor({ id: "other-user", userId: "someone-else" }),
    reservationFor({ id: "other-gym", gymId: "gym-other" }),
    reservationFor({ id: "other-sport", sport: "농구" }),
    reservationFor({ id: "other-date", date: "2026-05-21" }),
  ];

  it("time을 제외한 일치 조건으로만 좁힌다", () => {
    const keep = reservationFor({ id: "keep", time: "11:00" });
    const result = filterActiveDuplicateCandidates([...excluded, keep], scope);

    expect(result.map((r) => r.id)).toEqual(["keep"]);
  });

  it("time이 달라도 남긴다 (시간대별 판정은 호출부가 한다)", () => {
    const t10 = reservationFor({ id: "t10", time: "10:00" });
    const t11 = reservationFor({ id: "t11", time: "11:00" });

    expect(
      filterActiveDuplicateCandidates([t10, t11], scope).map((r) => r.id),
    ).toEqual(["t10", "t11"]);
  });

  // 핵심 불변식: 좁힌 목록으로 판정해도 전체 목록으로 판정한 것과 결과가 같아야 한다.
  // 이게 깨지면 예약 폼이 중복 예약을 놓치거나 잘못 막는다.
  it("좁히기 전후로 validateReservationDraft 결과가 동일하다", () => {
    const all: Reservation[] = [
      ...excluded,
      reservationFor({ id: "active-10", time: "10:00" }),
    ];
    const narrowed = filterActiveDuplicateCandidates(all, scope);

    for (const time of baseGym.availableTimes) {
      const draft: ReservationDraft = { ...draftFor(scope.date), time };
      const now = new Date("2026-05-01T00:00:00+09:00");

      const full = validateReservationDraft({
        gym: baseGym,
        reservations: all,
        draft,
        now,
      });
      const narrow = validateReservationDraft({
        gym: baseGym,
        reservations: narrowed,
        draft,
        now,
      });

      expect(narrow.ok).toBe(full.ok);
      if (!full.ok && !narrow.ok) {
        expect(narrow.reason).toBe(full.reason);
        expect(narrow.reservation?.id).toBe(full.reservation?.id);
      }
    }
  });
});
