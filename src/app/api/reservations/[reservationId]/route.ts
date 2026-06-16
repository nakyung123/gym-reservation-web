import { after, type NextRequest } from "next/server";
import { createUserReservationDetail } from "@/lib/reservation-detail";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  cancelReservationInDb,
  getUserReservationDetailById,
} from "@/lib/server/db-reservation-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import { notifyReservationEvent } from "@/lib/server/reservation-notify";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reservationId: string }> };

export async function GET(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  let record: Awaited<ReturnType<typeof getUserReservationDetailById>>;
  try {
    record = await getUserReservationDetailById(auth.uid, reservationId);
  } catch (error) {
    return serverErrorResponse(
      "예약 상세를 불러오지 못했습니다.",
      "Failed to fetch user reservation detail",
      error,
    );
  }
  if (!record) {
    return Response.json(
      { message: "예약을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json({
    reservation: record.reservation,
    detail: createUserReservationDetail(record.reservation),
    gym: record.gym,
  });
}

export async function DELETE(request: NextRequest, ctx: Context) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const { reservationId } = await ctx.params;
  let result: Awaited<ReturnType<typeof cancelReservationInDb>>;
  try {
    result = await cancelReservationInDb(auth.uid, reservationId);
  } catch (error) {
    return serverErrorResponse(
      "예약을 취소하지 못했습니다.",
      "Failed to cancel user reservation",
      error,
    );
  }

  if (result.ok) {
    if (result.status === "cancelled") {
      // 실제 취소(상태 변경)일 때만 알림. unchanged(이미 취소된 건 재취소)엔 안 보낸다(멱등).
      // 시설명은 best-effort 조회 — 못 구하면 gymId로 폴백한다(알림이 예약 흐름을 못 깬다).
      // (시설명 조회는 빠른 PK 조회라 응답 전에 끝내고, 느린 외부 Slack POST만 after로 분리.)
      const reservation = result.reservation;
      let gymName = reservation.gymId;
      try {
        const gym = await gymRepository.findById(reservation.gymId);
        if (gym) gymName = gym.name;
      } catch (error) {
        console.error("[reservation cancel] 시설명 조회 실패(알림 라벨 폴백)", error);
      }
      // 알림은 사이드이펙트라 응답 후(after)에 실행 → 사용자 응답 지연 0.
      after(() =>
        notifyReservationEvent({
          kind: "cancelled",
          gymName,
          sport: reservation.sport,
          date: reservation.date,
          time: reservation.time,
        }),
      );
    }
    return Response.json({
      status: result.status,
      reservation: result.reservation,
      detail: createUserReservationDetail(result.reservation),
      message: result.message,
    });
  }

  if (result.status === "not-found") {
    return Response.json({ message: result.message }, { status: 404 });
  }
  if (result.status === "auth-required") {
    return Response.json({ message: result.message }, { status: 403 });
  }
  return Response.json(
    {
      status: result.status,
      reservation: result.reservation,
      detail: result.reservation
        ? createUserReservationDetail(result.reservation)
        : null,
      message: result.message,
    },
    { status: 409 },
  );
}
