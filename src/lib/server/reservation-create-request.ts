import "server-only";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isPaymentMethod, isSport } from "@/lib/domain-constants";
import { parsePhone } from "@/lib/user-profile";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import type { CreateReservationInput } from "@/lib/server/db-reservation-repository";
import type { Gym } from "@/types/domain";

// 예약 생성 요청 본문 검증. 결제 없는 즉시 예약(POST /api/reservations)과
// 결제 준비(POST /api/payments/prepare)가 같은 규칙을 쓴다.
// 실패하면 그대로 돌려줄 Response를 담아 반환한다.

type CreateBody = {
  gymId?: unknown;
  sport?: unknown;
  date?: unknown;
  time?: unknown;
  people?: unknown;
  paymentMethod?: unknown;
  phone?: unknown;
};

export type ParsedCreateReservationRequest = {
  draft: CreateReservationInput["draft"];
  gym: Gym;
};

export async function parseCreateReservationRequest(
  request: Request,
): Promise<
  | { ok: true; value: ParsedCreateReservationRequest }
  | { ok: false; response: Response }
> {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return {
      ok: false,
      response: Response.json(
        { message: "요청 본문이 JSON 형식이 아닙니다." },
        { status: 400 },
      ),
    };
  }

  if (
    typeof body.gymId !== "string" ||
    !isSport(body.sport) ||
    typeof body.date !== "string" ||
    typeof body.time !== "string"
  ) {
    return {
      ok: false,
      response: Response.json(
        { message: "요청 본문이 올바르지 않습니다." },
        { status: 400 },
      ),
    };
  }

  // people은 전송용 transient(미전송 시 서버가 1로 처리). 보낸 경우 number만 허용하고,
  // 범위 검증(정원 초과·비정수)은 validateReservationCreation의 isValidPeople이 422로 reject한다.
  if (body.people !== undefined && typeof body.people !== "number") {
    return {
      ok: false,
      response: Response.json(
        { message: "이용 인원이 올바르지 않습니다." },
        { status: 400 },
      ),
    };
  }

  // paymentMethod는 선택적(미전송 시 null). 보낸 경우 알려진 결제 수단만 허용한다.
  if (body.paymentMethod !== undefined && !isPaymentMethod(body.paymentMethod)) {
    return {
      ok: false,
      response: Response.json(
        { message: "결제 수단이 올바르지 않습니다." },
        { status: 400 },
      ),
    };
  }
  const paymentMethod = isPaymentMethod(body.paymentMethod)
    ? body.paymentMethod
    : null;

  // phone은 선택적(미전송/빈 문자열은 null 저장). 보낸 경우 프로필 연락처와 같은
  // 형식 규칙(parsePhone SSOT)으로 검증한다.
  const phoneParsed = parsePhone(body.phone ?? null);
  if (!phoneParsed.ok) {
    return {
      ok: false,
      response: Response.json({ message: phoneParsed.message }, { status: 400 }),
    };
  }

  let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
  try {
    gym = await gymRepository.findById(body.gymId);
  } catch (error) {
    return {
      ok: false,
      response: serverErrorResponse(
        "체육관 정보를 불러오지 못했습니다.",
        "Failed to fetch gym for reservation creation",
        error,
      ),
    };
  }
  if (!gym) {
    return {
      ok: false,
      response: Response.json(
        { message: "체육관 정보를 찾을 수 없습니다." },
        { status: 404 },
      ),
    };
  }

  return {
    ok: true,
    value: {
      gym,
      draft: {
        gymId: body.gymId,
        sport: body.sport,
        date: body.date,
        time: body.time,
        people: body.people,
        paymentMethod,
        phone: phoneParsed.value,
      },
    },
  };
}
