import { validateReservationDraft } from "@/lib/reservation-rules";
import { reservationRepository } from "@/lib/reservation-repository-provider";
import type { ReservationRepository } from "@/lib/reservation-repository";
import type {
  Gym,
  Reservation,
  ReservationDraft,
  ReservationSlotAvailability,
} from "@/types/domain";

export type CreateReservationResult =
  | {
      ok: true;
      status: "created";
      message: string;
      reservation: Reservation;
    }
  | {
      ok: false;
      status: "duplicate";
      message: string;
      reservation: Reservation;
    }
  | {
      ok: false;
      status: "full";
      message: string;
      slot: ReservationSlotAvailability;
    }
  | {
      ok: false;
      status: "rejected";
      message: string;
    };

export async function createReservation({
  gym,
  draft,
  now = new Date(),
  repository = reservationRepository,
}: {
  gym: Gym;
  draft: ReservationDraft;
  now?: Date;
  repository?: ReservationRepository;
}): Promise<CreateReservationResult> {
  // 중복 판정 근거를 전체 예약 스냅샷(read)이 아니라 이 슬롯 범위 조회로 가져온다.
  //
  // read()는 저장소를 구독 중인 화면이 있을 때만 채워지는 값이라, 구독자가 없는
  // 예약 폼 화면에서는 영원히 not-ready였다. 판정에 필요한 건 (체육관·종목·날짜)
  // 범위의 활성 예약뿐이므로 그것만 직접 조회한다.
  const scoped = await repository.fetchActiveInScope({
    gymId: draft.gymId,
    sport: draft.sport,
    date: draft.date,
  });

  if (!scoped.ok) {
    return {
      ok: false,
      status: "rejected",
      message: scoped.message,
    };
  }

  const validation = validateReservationDraft({
    gym,
    reservations: scoped.reservations,
    draft,
    now,
  });

  if (!validation.ok) {
    if (
      validation.reason === "duplicate-active-reservation" &&
      validation.reservation
    ) {
      return {
        ok: false,
        status: "duplicate",
        message: validation.message,
        reservation: validation.reservation,
      };
    }

    return {
      ok: false,
      status: "rejected",
      message: validation.message,
    };
  }

  const reservation = repository.build(draft);
  const writeResult = await repository.create(reservation);

  if (writeResult.ok) {
    return {
      ok: true,
      status: "created",
      message:
        "예약이 생성되었습니다. 내 예약 화면에서 QR 입장권을 확인할 수 있습니다.",
      reservation: writeResult.reservation,
    };
  }

  if (writeResult.status === "duplicate") {
    return {
      ok: false,
      status: "duplicate",
      message: writeResult.message,
      reservation: writeResult.reservation,
    };
  }

  if (writeResult.status === "full") {
    return {
      ok: false,
      status: "full",
      message: writeResult.message,
      slot: writeResult.slot,
    };
  }

  if (writeResult.status === "failed") {
    return {
      ok: false,
      status: "rejected",
      message: writeResult.message,
    };
  }

  return {
    ok: false,
    status: "rejected",
    message: "예약 처리 결과를 확인할 수 없습니다.",
  };
}
