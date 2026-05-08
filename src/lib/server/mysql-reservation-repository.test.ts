import { describe, expect, it } from "vitest";
import {
  cancelReservationInMysql,
  createReservationInMysql,
} from "@/lib/server/mysql-reservation-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-mysql";

const userA = "user-a";
const userB = "user-b";

function draftFor(time: string, sport: "배드민턴" | "농구" = "배드민턴") {
  return {
    gymId: TEST_GYM.id,
    sport,
    date: futureDate(),
    time,
  };
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
    expect(reservations).toHaveLength(1);
    expect(locks).toHaveLength(1);
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
