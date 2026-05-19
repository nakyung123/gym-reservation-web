import { describe, expect, it } from "vitest";
import {
  cancelReservationAsAdminInMysql,
  cancelReservationInMysql,
  createReservationInMysql,
  getAdminReservationOverview,
  getAdminReservationById,
  getUserReservationDetailById,
  getUserReservationById,
  listAdminReservations,
  listReservationSlotAvailabilities,
  markReservationUsedInMysql,
  RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT,
  updateReservationSlotPolicies,
  updateReservationSlotPolicy,
} from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const userA = "user-a";
const userB = "user-b";
const weekdayLabels = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

function draftFor(time: string, sport: "배드민턴" | "농구" = "배드민턴") {
  return {
    gymId: TEST_GYM.id,
    sport,
    date: futureDate(),
    time,
  };
}

function futureDateForWeekday(weekday: number) {
  const date = new Date();
  const daysUntilWeekday = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilWeekday);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateTimeFor(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("createReservationInMysql", () => {
  it("정상 생성: reservation 1건과 lock 1건이 같은 activeKey로 INSERT된다", async () => {
    const result = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.status).toBe("reserved");
    expect(result.reservation.userId).toBe(userA);
    expect(result.reservation.price).toBe(12000); // sportPrices.배드민턴

    const reservations = await prisma.reservation.findMany();
    const locks = await prisma.reservationLock.findMany();
    const slots = await prisma.reservationSlot.findMany();
    expect(reservations).toHaveLength(1);
    expect(locks).toHaveLength(1);
    expect(slots).toHaveLength(1);
    expect(slots[0].reservedCount).toBe(1);
    expect(slots[0].capacity).toBe(4);
    expect(locks[0].activeKey).toBe(reservations[0].activeKey);
    expect(locks[0].reservationId).toBe(reservations[0].id);
  });

  it("같은 사용자가 같은 슬롯을 두 번 예약하면 두 번째는 duplicate로 차단된다", async () => {
    const draft = draftFor("11:00");

    const first = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);

    const second = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.status).toBe("duplicate");

    expect(await prisma.reservation.count()).toBe(1);
    expect(await prisma.reservationLock.count()).toBe(1);
  });

  it("슬롯 정원이 마감되면 예약을 생성하지 않고 full을 반환한다", async () => {
    const draft = draftFor("10:00");
    await prisma.reservationSlot.create({
      data: {
        gymId: draft.gymId,
        sport: draft.sport,
        date: draft.date,
        time: draft.time,
        capacity: 1,
        reservedCount: 1,
      },
    });

    const result = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("full");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: draft.gymId,
          sport: draft.sport,
          date: draft.date,
          time: draft.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("운영자가 마감한 슬롯은 예약을 생성하지 않고 full을 반환한다", async () => {
    const draft = draftFor("10:00");
    const updated = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draft,
      isClosed: true,
    });
    expect(updated.ok).toBe(true);

    const result = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("full");
    if (result.status !== "full") return;
    expect(result.slot.status).toBe("closed");
    expect(result.slot.isClosed).toBe(true);
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("체육관 휴관일에는 예약을 생성하지 않고 rejected를 반환한다", async () => {
    const closedWeekday = 0;
    const draft = {
      ...draftFor("10:00"),
      date: futureDateForWeekday(closedWeekday),
    };

    const result = await createReservationInMysql({
      userId: userA,
      draft,
      gym: {
        ...TEST_GYM,
        closedDays: [weekdayLabels[closedWeekday]],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(result.message).toBe("선택한 날짜는 체육관 휴관일입니다.");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.reservationLock.count()).toBe(0);
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("같은 슬롯에 동시 호출이 발생해도 최종 상태는 reservation 1건/lock 1건이다 (트랜잭션 롤백 검증)", async () => {
    const draft = draftFor("12:00");

    const [r1, r2] = await Promise.all([
      createReservationInMysql({ userId: userA, draft, gym: TEST_GYM }),
      createReservationInMysql({ userId: userA, draft, gym: TEST_GYM }),
    ]);

    const okCount = [r1, r2].filter((r) => r.ok).length;
    const duplicateCount = [r1, r2].filter(
      (r) => !r.ok && r.status === "duplicate",
    ).length;

    // 정확히 한쪽만 성공, 다른 쪽은 duplicate. 어중간하게 reservation은 INSERT됐는데 lock이 없는 상태가 남으면 안 된다.
    expect(okCount).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await prisma.reservationLock.count()).toBe(1);
  });

  it("다른 사용자가 같은 슬롯을 예약하는 것은 막지 않는다 (activeKey가 userId 포함)", async () => {
    const draft = draftFor("14:00");

    const aResult = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    const bResult = await createReservationInMysql({
      userId: userB,
      draft,
      gym: TEST_GYM,
    });

    expect(aResult.ok).toBe(true);
    expect(bResult.ok).toBe(true);
    expect(await prisma.reservation.count()).toBe(2);
    expect(await prisma.reservationLock.count()).toBe(2);
  });

  it("마지막 1자리를 동시에 예약하면 한 명만 성공한다", async () => {
    const draft = draftFor("10:00");
    await prisma.reservationSlot.create({
      data: {
        gymId: draft.gymId,
        sport: draft.sport,
        date: draft.date,
        time: draft.time,
        capacity: 1,
      },
    });

    const [aResult, bResult] = await Promise.all([
      createReservationInMysql({ userId: userA, draft, gym: TEST_GYM }),
      createReservationInMysql({ userId: userB, draft, gym: TEST_GYM }),
    ]);

    const okCount = [aResult, bResult].filter((result) => result.ok).length;
    const fullCount = [aResult, bResult].filter(
      (result) => !result.ok && result.status === "full",
    ).length;

    expect(okCount).toBe(1);
    expect(fullCount).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await prisma.reservationLock.count()).toBe(1);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: draft.gymId,
          sport: draft.sport,
          date: draft.date,
          time: draft.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("슬롯 조회는 저장된 카운터와 기본 정원을 함께 반환한다", async () => {
    const draft = draftFor("10:00");
    const created = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    const slots = await listReservationSlotAvailabilities({
      gym: TEST_GYM,
      sport: draft.sport,
      date: draft.date,
    });

    const reservedSlot = slots.find((slot) => slot.time === "10:00");
    const emptySlot = slots.find((slot) => slot.time === "11:00");

    expect(slots).toHaveLength(TEST_GYM.availableTimes.length);
    expect(reservedSlot).toMatchObject({
      capacity: 4,
      reservedCount: 1,
      remaining: 3,
      status: "available",
    });
    expect(emptySlot).toMatchObject({
      capacity: 4,
      reservedCount: 0,
      remaining: 4,
      isClosed: false,
      status: "available",
    });
  });
});

describe("getUserReservationById", () => {
  it("사용자는 본인 예약을 ID로 조회할 수 있다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const reservation = await getUserReservationById(
      userA,
      created.reservation.id,
    );

    expect(reservation).toEqual(created.reservation);
  });

  it("다른 사용자의 예약은 조회하지 않는다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const reservation = await getUserReservationById(
      userB,
      created.reservation.id,
    );

    expect(reservation).toBeNull();
  });
});

describe("getUserReservationDetailById", () => {
  it("returns the reservation with gym metadata even when the gym is inactive", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await prisma.reservation.update({
      where: { id: created.reservation.id },
      data: { status: "cancelled" },
    });
    await prisma.gym.update({
      where: { id: TEST_GYM.id },
      data: { isActive: false },
    });

    const detail = await getUserReservationDetailById(
      userA,
      created.reservation.id,
    );

    expect(detail).toMatchObject({
      reservation: {
        id: created.reservation.id,
        status: "cancelled",
      },
      gym: {
        id: TEST_GYM.id,
        name: TEST_GYM.name,
      },
    });
  });

  it("does not return another user's reservation detail", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("11:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await expect(
      getUserReservationDetailById(userB, created.reservation.id),
    ).resolves.toBeNull();
  });
});

describe("updateReservationSlotPolicy", () => {
  it("운영자가 슬롯 정원과 마감 상태를 변경할 수 있다", async () => {
    const draft = draftFor("10:00");

    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draft,
      capacity: 2,
      isClosed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot).toMatchObject({
      capacity: 2,
      reservedCount: 0,
      remaining: 0,
      isClosed: true,
      status: "closed",
    });

    const reopened = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draft,
      isClosed: false,
    });

    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.slot).toMatchObject({
      capacity: 2,
      remaining: 2,
      isClosed: false,
      status: "available",
    });
  });

  it("이미 예약된 인원보다 낮은 정원으로 줄이는 것은 거부한다", async () => {
    const draft = draftFor("11:00");
    const first = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    const second = await createReservationInMysql({
      userId: userB,
      draft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draft,
      capacity: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("conflict");

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: draft.gymId,
          sport: draft.sport,
          date: draft.date,
          time: draft.time,
        },
      },
    });
    expect(slot.capacity).toBe(4);
    expect(slot.reservedCount).toBe(2);
  });

  it("체육관 정보와 슬롯 대상이 다르면 변경하지 않는다", async () => {
    const result = await updateReservationSlotPolicy({
      gym: { ...TEST_GYM, id: "another-gym" },
      ...draftFor("10:00"),
      capacity: 5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("정원 상한을 넘긴 슬롯 정책 변경을 거부한다", async () => {
    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draftFor("10:00"),
      capacity: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("존재하지 않는 날짜의 슬롯 정책 변경을 거부한다", async () => {
    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draftFor("10:00"),
      date: "2026-02-30",
      capacity: 5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(result.message).toBe("날짜는 YYYY-MM-DD 형식이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects a slot policy change without a capacity or closed flag", async () => {
    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draftFor("10:00"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects a slot policy change for a time the gym does not expose", async () => {
    const result = await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draftFor("09:00"),
      isClosed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });
});

describe("updateReservationSlotPolicies", () => {
  it("운영자가 여러 날짜와 시간대의 슬롯 정책을 한 번에 변경할 수 있다", async () => {
    const firstDate = futureDate();
    const secondDate = futureDate(8);

    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      dates: [firstDate, secondDate],
      times: ["10:00", "11:00"],
      capacity: 6,
      isClosed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updatedCount).toBe(4);
    expect(result.slots).toHaveLength(4);
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: firstDate,
          time: "10:00",
          capacity: 6,
          isClosed: true,
          status: "closed",
        }),
        expect.objectContaining({
          date: secondDate,
          time: "11:00",
          capacity: 6,
          isClosed: true,
          status: "closed",
        }),
      ]),
    );

    const rows = await prisma.reservationSlot.findMany({
      where: {
        gymId: TEST_GYM.id,
        sport: "배드민턴",
        date: { in: [firstDate, secondDate] },
        time: { in: ["10:00", "11:00"] },
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.capacity === 6)).toBe(true);
    expect(rows.every((row) => row.isClosed)).toBe(true);
  });

  it("deduplicates repeated dates and times before applying bulk slot policies", async () => {
    const date = futureDate();

    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: TEST_GYM.sports[0],
      dates: [date, date],
      times: ["10:00", "10:00"],
      capacity: 6,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updatedCount).toBe(1);
    expect(result.slots).toHaveLength(1);
    expect(await prisma.reservationSlot.count()).toBe(1);
  });

  it("일괄 변경 중 충돌이 있으면 전체 변경을 거부한다", async () => {
    const date = futureDate();
    const reservedDraft = {
      gymId: TEST_GYM.id,
      sport: "배드민턴" as const,
      date,
      time: "10:00",
    };
    const first = await createReservationInMysql({
      userId: userA,
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const second = await createReservationInMysql({
      userId: userB,
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      dates: [date],
      times: ["10:00", "11:00"],
      capacity: 1,
      isClosed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("conflict");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts?.[0]).toMatchObject({
      date,
      time: "10:00",
      reservedCount: 2,
      capacity: 4,
    });

    const untouchedSlot = await prisma.reservationSlot.findUnique({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "11:00",
        },
      },
    });
    expect(untouchedSlot).toBeNull();

    const reservedSlot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: "배드민턴",
          date,
          time: "10:00",
        },
      },
    });
    expect(reservedSlot.capacity).toBe(4);
    expect(reservedSlot.isClosed).toBe(false);
  });

  it("체육관 정보와 일괄 변경 대상이 다르면 변경하지 않는다", async () => {
    const result = await updateReservationSlotPolicies({
      gym: { ...TEST_GYM, id: "another-gym" },
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      dates: [futureDate()],
      times: ["10:00", "11:00"],
      capacity: 5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("존재하지 않는 날짜가 포함된 일괄 변경을 거부한다", async () => {
    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: "배드민턴",
      dates: ["2026-02-30"],
      times: ["10:00"],
      capacity: 5,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(result.message).toBe("날짜는 YYYY-MM-DD 형식이어야 합니다.");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects bulk slot policies without a capacity or closed flag", async () => {
    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: TEST_GYM.sports[0],
      dates: [futureDate()],
      times: ["10:00"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects bulk slot policies with empty targets", async () => {
    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: TEST_GYM.sports[0],
      dates: [],
      times: ["10:00"],
      isClosed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects bulk slot policies for times the gym does not expose", async () => {
    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: TEST_GYM.sports[0],
      dates: [futureDate()],
      times: ["09:00"],
      isClosed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });

  it("rejects bulk slot policies over the target limit", async () => {
    const dates = Array.from(
      { length: RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT + 1 },
      (_, index) => futureDate(index + 1),
    );

    const result = await updateReservationSlotPolicies({
      gym: TEST_GYM,
      gymId: TEST_GYM.id,
      sport: TEST_GYM.sports[0],
      dates,
      times: ["10:00"],
      isClosed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("rejected");
    expect(await prisma.reservationSlot.count()).toBe(0);
  });
});

describe("cancelReservationInMysql", () => {
  it("취소하면 reservation.status가 cancelled가 되고 lock이 해제된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cancelled = await cancelReservationInMysql(
      userA,
      created.reservation.id,
    );

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.reservation.status).toBe("cancelled");

    const reservation = await prisma.reservation.findUnique({
      where: { id: created.reservation.id },
    });
    expect(reservation?.status).toBe("cancelled");

    const locks = await prisma.reservationLock.findMany({
      where: { activeKey: reservation?.activeKey ?? "" },
    });
    expect(locks).toHaveLength(0);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(0);
  });

  it("취소된 슬롯은 같은 사용자가 다시 예약할 수 있다 (lock 해제 검증)", async () => {
    const draft = draftFor("11:00");

    const first = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await cancelReservationInMysql(userA, first.reservation.id);

    const second = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reservation.id).not.toBe(first.reservation.id);

    // reserved 상태의 lock은 1건만 존재.
    const reservedLocks = await prisma.reservationLock.findMany();
    expect(reservedLocks).toHaveLength(1);
    expect(reservedLocks[0].reservationId).toBe(second.reservation.id);
  });

  it("이미 취소된 예약을 다시 취소하면 unchanged로 멱등 처리된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("12:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const firstCancel = await cancelReservationInMysql(
      userA,
      created.reservation.id,
    );
    expect(firstCancel.ok).toBe(true);
    if (!firstCancel.ok) return;
    expect(firstCancel.status).toBe("cancelled");

    const secondCancel = await cancelReservationInMysql(
      userA,
      created.reservation.id,
    );
    expect(secondCancel.ok).toBe(true);
    if (!secondCancel.ok) return;
    expect(secondCancel.status).toBe("unchanged");

    // 두 번째 취소가 DB를 추가로 변경하지 않는다.
    const reservation = await prisma.reservation.findUnique({
      where: { id: created.reservation.id },
    });
    expect(reservation?.status).toBe("cancelled");
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("이용 시작 2시간 이내에는 사용자가 예약을 취소할 수 없다", async () => {
    const draft = draftFor("10:00");
    const created = await createReservationInMysql({
      userId: userA,
      draft,
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const now = dateTimeFor(draft.date, "08:01");
    const result = await cancelReservationInMysql(
      userA,
      created.reservation.id,
      { now },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("not-cancellable");
    expect(result.message).toBe("이용 시작 2시간 전까지만 취소할 수 있습니다.");
    expect(result.reservation?.status).toBe("reserved");
    expect(await prisma.reservationLock.count()).toBe(1);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("다른 사용자가 취소하면 auth-required로 거부된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("14:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await cancelReservationInMysql(
      userB,
      created.reservation.id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("auth-required");

    // 원본 예약은 그대로 reserved.
    const reservation = await prisma.reservation.findUnique({
      where: { id: created.reservation.id },
    });
    expect(reservation?.status).toBe("reserved");
    expect(await prisma.reservationLock.count()).toBe(1);
  });

  it("존재하지 않는 reservationId 취소는 not-found를 반환한다", async () => {
    const result = await cancelReservationInMysql(userA, "non-existent-id");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("not-found");
  });
});

describe("listAdminReservations", () => {
  it("관리자는 전체 예약을 조회하고 상태/날짜로 필터링할 수 있다", async () => {
    const reservedDraft = draftFor("10:00");
    const cancelledDraft = draftFor("11:00");

    const reserved = await createReservationInMysql({
      userId: userA,
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const cancelled = await createReservationInMysql({
      userId: userB,
      draft: cancelledDraft,
      gym: TEST_GYM,
    });
    expect(reserved.ok).toBe(true);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;

    await cancelReservationInMysql(userB, cancelled.reservation.id);

    const all = await listAdminReservations();
    const onlyReserved = await listAdminReservations({ status: "reserved" });
    const byDate = await listAdminReservations({ date: reservedDraft.date });

    expect(all).toHaveLength(2);
    expect(onlyReserved).toHaveLength(1);
    expect(onlyReserved[0].status).toBe("reserved");
    expect(byDate).toHaveLength(2);
  });
});

describe("getAdminReservationById", () => {
  it("관리자는 예약 ID로 단건 예약을 조회할 수 있다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const reservation = await getAdminReservationById(created.reservation.id);

    expect(reservation).toEqual(created.reservation);
  });

  it("존재하지 않는 예약 ID는 null을 반환한다", async () => {
    await expect(getAdminReservationById("missing-reservation")).resolves.toBe(
      null,
    );
  });
});

describe("getAdminReservationOverview", () => {
  it("날짜별 예약 상태, 매출, 슬롯 현황을 집계한다", async () => {
    const date = futureDate();
    const reservedDraft = { ...draftFor("10:00"), date };
    const cancelledDraft = { ...draftFor("11:00"), date };
    const usedDraft = { ...draftFor("12:00"), date };

    const reserved = await createReservationInMysql({
      userId: userA,
      draft: reservedDraft,
      gym: TEST_GYM,
    });
    const cancelled = await createReservationInMysql({
      userId: userB,
      draft: cancelledDraft,
      gym: TEST_GYM,
    });
    const used = await createReservationInMysql({
      userId: "user-c",
      draft: usedDraft,
      gym: TEST_GYM,
    });
    expect(reserved.ok).toBe(true);
    expect(cancelled.ok).toBe(true);
    expect(used.ok).toBe(true);
    if (!cancelled.ok || !used.ok) return;

    await cancelReservationAsAdminInMysql(cancelled.reservation.id);
    await markReservationUsedInMysql(used.reservation.id);
    await updateReservationSlotPolicy({
      gym: TEST_GYM,
      ...draftFor("14:00"),
      date,
      capacity: 2,
      isClosed: true,
    });

    const overview = await getAdminReservationOverview(date);

    expect(overview.reservations).toEqual({
      total: 3,
      reserved: 1,
      cancelled: 1,
      used: 1,
    });
    expect(overview.revenue).toEqual({
      expected: 24000,
      used: 12000,
    });
    expect(overview.slots).toMatchObject({
      total: 4,
      available: 3,
      full: 0,
      closed: 1,
      reservedCount: 2,
      capacity: 14,
    });
  });
});

describe("cancelReservationAsAdminInMysql", () => {
  it("관리자가 예약을 취소하면 lock이 해제되고 슬롯 카운터가 감소한다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cancelled = await cancelReservationAsAdminInMysql(
      created.reservation.id,
    );

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.reservation.status).toBe("cancelled");
    expect(await prisma.reservationLock.count()).toBe(0);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(0);
  });

  it("이미 취소된 예약을 다시 취소하면 unchanged로 멱등 처리된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("11:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await cancelReservationAsAdminInMysql(created.reservation.id);
    const second = await cancelReservationAsAdminInMysql(
      created.reservation.id,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.status).toBe("unchanged");
    expect(second.reservation.status).toBe("cancelled");
    expect(await prisma.reservationLock.count()).toBe(0);
  });

  it("이용 완료된 예약은 관리자도 취소할 수 없다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("12:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await markReservationUsedInMysql(created.reservation.id);
    const result = await cancelReservationAsAdminInMysql(created.reservation.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("not-cancellable");
    expect(result.reservation?.status).toBe("used");
    expect(await prisma.reservationLock.count()).toBe(0);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });
});

describe("markReservationUsedInMysql", () => {
  it("예약을 이용 완료 처리하면 status가 used가 되고 lock은 해제되지만 슬롯 카운터는 유지된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("10:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const used = await markReservationUsedInMysql(created.reservation.id);

    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(used.status).toBe("used");
    expect(used.reservation.status).toBe("used");
    expect(await prisma.reservationLock.count()).toBe(0);

    const slot = await prisma.reservationSlot.findUniqueOrThrow({
      where: {
        gymId_sport_date_time: {
          gymId: created.reservation.gymId,
          sport: created.reservation.sport,
          date: created.reservation.date,
          time: created.reservation.time,
        },
      },
    });
    expect(slot.reservedCount).toBe(1);
  });

  it("이미 이용 완료된 예약을 다시 처리하면 unchanged로 멱등 처리된다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("11:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await markReservationUsedInMysql(created.reservation.id);
    const second = await markReservationUsedInMysql(created.reservation.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.status).toBe("unchanged");
    expect(second.reservation.status).toBe("used");
  });

  it("취소된 예약은 이용 완료 처리할 수 없다", async () => {
    const created = await createReservationInMysql({
      userId: userA,
      draft: draftFor("12:00"),
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await cancelReservationInMysql(userA, created.reservation.id);
    const result = await markReservationUsedInMysql(created.reservation.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("not-usable");
    expect(result.reservation?.status).toBe("cancelled");
  });
});
