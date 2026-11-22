import { beforeEach, describe, expect, it, vi } from "vitest";
import { withdrawAccount } from "@/lib/server/withdrawal-service";
import { createReservationInDb } from "@/lib/server/db-reservation-repository";
import {
  failPaymentInDb,
  preparePaymentInDb,
} from "@/lib/server/db-payment-repository";
import { ensureUserProfile } from "@/lib/server/db-user-profile-repository";
import { prisma } from "@/lib/server/prisma-client";
import { TEST_GYM, futureDate } from "@tests/setup-db";

const { deleteUser } = vi.hoisted(() => ({
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ deleteUser }),
}));

function makeAuthError(code: string) {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

describe("withdrawAccount", () => {
  beforeEach(() => {
    deleteUser.mockReset();
  });

  it("진행 중 예약이 있으면 active-reservation 사유로 실패한다", async () => {
    const userId = "withdraw-user-active";
    const created = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({
      ok: false,
      reason: "active-reservation",
      message:
        "취소되지 않은 예약이 있어 탈퇴할 수 없습니다. 내 예약에서 모두 취소한 뒤 다시 시도해 주세요.",
    });

    // 데이터는 그대로 남아 있어야 한다.
    await expect(prisma.reservation.count({ where: { userId } })).resolves.toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
    await expect(prisma.withdrawalReason.count()).resolves.toBe(0);
  });

  it("결제 진행 중(정원 선점)이면 active-payment 사유로 실패하고 결제 기록을 지우지 않는다", async () => {
    const userId = "withdraw-user-paying";
    const prepared = await preparePaymentInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
      provider: "toss",
    });
    expect(prepared.ok).toBe(true);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({
      ok: false,
      reason: "active-payment",
      message: "진행 중인 결제가 있어 탈퇴할 수 없습니다. 15분 뒤 다시 시도해 주세요.",
    });
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("돈이 나갔는데 자동 환불이 실패한 결제가 있으면 탈퇴를 막고 기록을 남긴다", async () => {
    const userId = "withdraw-user-manual-refund";
    const prepared = await preparePaymentInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "12:00",
      },
      gym: TEST_GYM,
      provider: "toss",
    });
    if (!prepared.ok) throw new Error("prepare 실패");
    // 결제는 닫혔지만(failed) 늦게 온 PG 승인을 환불하지 못한 상태. 사람이 이 기록으로 환불한다.
    await prisma.payment.update({
      where: { id: prepared.payment.orderId },
      data: {
        status: "failed",
        holdKey: null,
        failureReason: "late-approval-refund-failed:NETWORK_ERROR",
      },
    });
    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({
      ok: false,
      reason: "active-payment",
      message:
        "처리가 끝나지 않은 결제가 있어 탈퇴할 수 없습니다. 잠시 뒤 다시 시도하거나 고객센터로 문의해 주세요.",
    });
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("수동 환불 사유가 남아 있어도 사람이 환불을 마쳐 refunded 가 된 결제는 탈퇴를 막지 않는다", async () => {
    const userId = "withdraw-user-manual-refund-done";
    const prepared = await preparePaymentInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "12:00",
      },
      gym: TEST_GYM,
      provider: "toss",
    });
    if (!prepared.ok) throw new Error("prepare 실패");
    await prisma.payment.update({
      where: { id: prepared.payment.orderId },
      data: {
        status: "refunded",
        holdKey: null,
        failureReason: "late-approval-refund-failed:NETWORK_ERROR",
      },
    });
    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(0);
  });

  it("결제창을 닫고 떠나 만료된 선점만 있으면 그 선점을 풀고 탈퇴를 허용한다", async () => {
    const userId = "withdraw-user-expired-hold";
    const prepared = await preparePaymentInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "14:00",
      },
      gym: TEST_GYM,
      provider: "toss",
      // 16분 전에 결제창을 열었다(선점 15분 만료).
      now: new Date(Date.now() - 16 * 60 * 1000),
    });
    if (!prepared.ok) throw new Error("prepare 실패");
    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(0);
    // 선점한 정원도 돌아왔다.
    const slot = await prisma.reservationSlot.findUnique({
      where: {
        gymId_sport_date_time: {
          gymId: TEST_GYM.id,
          sport: TEST_GYM.sports[0],
          date: futureDate(),
          time: "14:00",
        },
      },
    });
    expect(slot?.reservedCount ?? 0).toBe(0);
  });

  it("끝난 결제 기록은 탈퇴할 때 함께 지운다", async () => {
    const userId = "withdraw-user-paid-history";
    const prepared = await preparePaymentInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "11:00",
      },
      gym: TEST_GYM,
      provider: "toss",
    });
    if (!prepared.ok) throw new Error("prepare 실패");
    await failPaymentInDb({ userId, orderId: prepared.payment.orderId, code: "PAY_PROCESS_CANCELED" });
    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });
    await expect(prisma.payment.count({ where: { userId } })).resolves.toBe(0);
  });

  it("성공 경로에서 DB를 정리하고 Auth 삭제 후 사유를 1회 기록한다", async () => {
    const userId = "withdraw-user-success";
    await ensureUserProfile(userId, "local");
    await prisma.favorite.create({
      data: { userId, gymId: TEST_GYM.id },
    });

    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, {
        category: "서비스 불만족",
        detail: "사용성이 부족합니다",
      }),
    ).resolves.toEqual({ ok: true });

    await expect(prisma.favorite.count({ where: { userId } })).resolves.toBe(0);
    await expect(prisma.userProfile.count({ where: { userId } })).resolves.toBe(0);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(userId);

    const reasons = await prisma.withdrawalReason.findMany();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      category: "서비스 불만족",
      detail: "사용성이 부족합니다",
    });
  });

  it("취소된 예약만 있는 경우에는 탈퇴를 허용한다", async () => {
    const userId = "withdraw-user-cancelled";
    const created = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.reservation.update({
      where: { id: created.reservation.id },
      data: { status: "cancelled" },
    });

    deleteUser.mockResolvedValue(undefined);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });

    await expect(prisma.reservation.count({ where: { userId } })).resolves.toBe(0);
  });

  it("Auth delete가 user-not-found이면 사유 기록 없이 ok로 처리한다", async () => {
    const userId = "withdraw-user-not-found";
    await ensureUserProfile(userId, "local");
    deleteUser.mockRejectedValue(makeAuthError("auth/user-not-found"));

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });

    // DB는 이미 정리됐다.
    await expect(prisma.userProfile.count({ where: { userId } })).resolves.toBe(0);
    // 재시도 진입 모르므로 사유 중복 방지를 위해 skip한다.
    await expect(prisma.withdrawalReason.count()).resolves.toBe(0);
  });

  it("Auth delete가 다른 에러로 실패하면 auth-delete-failed 사유로 응답한다", async () => {
    const userId = "withdraw-user-auth-fail";
    await ensureUserProfile(userId, "local");
    deleteUser.mockRejectedValue(makeAuthError("auth/internal-error"));

    await expect(
      withdrawAccount(userId, {
        category: "개인정보",
        detail: "민감 데이터 제거",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "auth-delete-failed",
      message:
        "회원 정보는 삭제되었지만 인증 계정 정리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });

    // DB는 이미 정리됐고 사유는 아직 기록되지 않았다 (재시도에서 1회만 기록).
    await expect(prisma.userProfile.count({ where: { userId } })).resolves.toBe(0);
    await expect(prisma.withdrawalReason.count()).resolves.toBe(0);
  });

  it("DB 삭제 실패는 내부 오류 상세를 사용자 메시지에 섞지 않는다", async () => {
    const userId = "withdraw-user-db-fail";
    await ensureUserProfile(userId, "local");
    const txSpy = vi
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(new Error("database offline"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await expect(
        withdrawAccount(userId, { category: "기타", detail: null }),
      ).resolves.toEqual({
        ok: false,
        reason: "error",
        message: "회원 정보 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      expect(deleteUser).not.toHaveBeenCalled();
    } finally {
      txSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  // 진행 중 예약 검사는 삭제와 같은 트랜잭션 안에서 수행되므로,
  // 검사에 걸리면 이미 실행된 삭제(취소된 예약 등)까지 전부 롤백되어야 한다.
  it("진행 중 예약이 있으면 전체 롤백되어 프로필·즐겨찾기도 보존된다", async () => {
    const userId = "withdraw-user-rollback";
    await ensureUserProfile(userId, "local");
    await prisma.favorite.create({ data: { userId, gymId: TEST_GYM.id } });
    const created = await createReservationInDb({
      userId,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "11:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);

    await expect(
      withdrawAccount(userId, { category: "기타", detail: null }),
    ).resolves.toMatchObject({ ok: false, reason: "active-reservation" });

    expect(deleteUser).not.toHaveBeenCalled();
    await expect(
      prisma.userProfile.count({ where: { userId } }),
    ).resolves.toBe(1);
    await expect(prisma.favorite.count({ where: { userId } })).resolves.toBe(1);
    await expect(
      prisma.reservation.count({ where: { userId } }),
    ).resolves.toBe(1);
  });

  it("Auth fail 후 재시도가 성공하면 사유가 1회만 기록된다 (idempotency)", async () => {
    const userId = "withdraw-user-retry";
    await ensureUserProfile(userId, "local");

    // 1차: Auth 에러로 부분 완료
    deleteUser.mockRejectedValueOnce(makeAuthError("auth/internal-error"));
    const first = await withdrawAccount(userId, {
      category: "기타",
      detail: "재시도 케이스",
    });
    expect(first).toMatchObject({ ok: false, reason: "auth-delete-failed" });

    // 2차: Auth 성공
    deleteUser.mockResolvedValueOnce(undefined);
    const second = await withdrawAccount(userId, {
      category: "기타",
      detail: "재시도 케이스",
    });
    expect(second).toEqual({ ok: true });

    // 사유는 단 1건만 기록되어야 한다.
    const reasons = await prisma.withdrawalReason.findMany();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      category: "기타",
      detail: "재시도 케이스",
    });
  });

  it("사유 기록 실패해도 사용자에게는 ok로 응답한다", async () => {
    const userId = "withdraw-user-reason-fail";
    await ensureUserProfile(userId, "local");
    deleteUser.mockResolvedValue(undefined);

    const createSpy = vi
      .spyOn(prisma.withdrawalReason, "create")
      .mockRejectedValueOnce(new Error("reason record failed"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await expect(
        withdrawAccount(userId, { category: "기타", detail: null }),
      ).resolves.toEqual({ ok: true });
      expect(createSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("진행 중 예약 검사는 사용자별로 격리된다", async () => {
    const userA = "withdraw-user-a";
    const userB = "withdraw-user-b";
    await ensureUserProfile(userA, "local");
    const created = await createReservationInDb({
      userId: userB,
      draft: {
        gymId: TEST_GYM.id,
        sport: TEST_GYM.sports[0],
        date: futureDate(),
        time: "10:00",
      },
      gym: TEST_GYM,
    });
    expect(created.ok).toBe(true);
    deleteUser.mockResolvedValue(undefined);

    // userA는 예약이 없어 탈퇴 가능. userB의 예약은 영향받지 않는다.
    await expect(
      withdrawAccount(userA, { category: "기타", detail: null }),
    ).resolves.toEqual({ ok: true });
    await expect(prisma.reservation.count({ where: { userId: userB } })).resolves.toBe(
      1,
    );
  });
});
