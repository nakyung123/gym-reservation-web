import { describe, expect, it } from "vitest";
import {
  createUserReservationDetail,
  getReservationEntryCode,
  isUserReservationDetail,
} from "@/lib/reservation-detail";
import type { Reservation } from "@/types/domain";

const reservation: Reservation = {
  id: "reservation-detail-code",
  userId: "detail-user",
  gymId: "detail-gym",
  sport: "배드민턴",
  date: "2026-05-20",
  time: "10:00",
  price: 12000,
  status: "reserved",
  paymentMethod: null,
  phone: null,
  createdAt: "2026-05-01T00:00:00.000Z",
};

describe("reservation detail helpers", () => {
  it("creates cancellable metadata for a future reservation", () => {
    const detail = createUserReservationDetail(reservation, {
      now: new Date("2026-05-20T06:00:00+09:00"),
    });

    expect(detail.cancellation).toMatchObject({
      canCancel: true,
      reason: null,
      message: null,
    });
    // 마감 = KST 2026-05-20 08:00 (이용 시작 2시간 전) = UTC 2026-05-19 23:00.
    expect(new Date(detail.cancellation.deadline ?? "").getTime()).toBe(
      new Date("2026-05-20T08:00:00+09:00").getTime(),
    );
  });

  it("marks reservation as not cancellable after the cancellation deadline", () => {
    const detail = createUserReservationDetail(reservation, {
      now: new Date("2026-05-20T08:01:00+09:00"),
    });

    expect(detail.cancellation).toMatchObject({
      canCancel: false,
      reason: "cancel-deadline-passed",
    });
    expect(detail.cancellation.message).toContain("전까지만 취소");
  });

  it("marks inactive reservations as not cancellable", () => {
    const detail = createUserReservationDetail({
      ...reservation,
      status: "cancelled",
    });

    expect(detail).toMatchObject({
      cancellation: {
        canCancel: false,
        deadline: null,
        reason: "not-reserved",
        message: "이미 취소된 예약입니다.",
      },
    });
  });

  it("builds the same entry code shape used by the QR check-in modal", () => {
    expect(getReservationEntryCode(reservation)).toBe("RESERVATIO");
  });

  it("recognizes valid and malformed detail response shapes", () => {
    const detail = createUserReservationDetail(reservation);

    expect(isUserReservationDetail(detail)).toBe(true);
    expect(
      isUserReservationDetail({
        ...detail,
        cancellation: { ...detail.cancellation, canCancel: "yes" },
      }),
    ).toBe(false);
    expect(
      isUserReservationDetail({
        ...detail,
        cancellation: { ...detail.cancellation, deadline: 123 },
      }),
    ).toBe(false);
  });
});
