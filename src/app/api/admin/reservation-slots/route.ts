import type { NextRequest } from "next/server";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isSport } from "@/lib/domain-constants";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { updateReservationSlotPolicy } from "@/lib/server/db-reservation-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

type UpdateSlotBody = {
  gymId?: unknown;
  sport?: unknown;
  date?: unknown;
  time?: unknown;
  capacity?: unknown;
  isClosed?: unknown;
};

function parseCapacity(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 999
  ) {
    throw new Error("정원은 1명 이상 999명 이하의 정수여야 합니다.");
  }
  return value;
}

export async function PATCH(request: NextRequest) {
  const ipLimit = await checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: UpdateSlotBody;
  try {
    body = (await request.json()) as UpdateSlotBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.gymId !== "string" ||
    !isSport(body.sport) ||
    typeof body.date !== "string" ||
    !isValidReservationDateValue(body.date) ||
    typeof body.time !== "string"
  ) {
    return Response.json(
      { message: "슬롯 변경 요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (body.isClosed !== undefined && typeof body.isClosed !== "boolean") {
    return Response.json(
      { message: "isClosed는 boolean이어야 합니다." },
      { status: 400 },
    );
  }

  let capacity: number | undefined;
  try {
    capacity = parseCapacity(body.capacity);
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "정원 형식이 올바르지 않습니다.",
      },
      { status: 400 },
    );
  }

  if (capacity === undefined && body.isClosed === undefined) {
    return Response.json(
      { message: "변경할 정원 또는 마감 상태가 필요합니다." },
      { status: 400 },
    );
  }

  let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
  try {
    gym = await gymRepository.findById(body.gymId);
  } catch (error) {
    return serverErrorResponse(
      "체육관 정보를 불러오지 못했습니다.",
      "Failed to fetch gym for slot policy update",
      error,
    );
  }
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  let result: Awaited<ReturnType<typeof updateReservationSlotPolicy>>;
  try {
    result = await updateReservationSlotPolicy({
      gym,
      gymId: body.gymId,
      sport: body.sport,
      date: body.date,
      time: body.time,
      capacity,
      isClosed: body.isClosed,
    });
  } catch (error) {
    return serverErrorResponse(
      "슬롯 정책을 변경하지 못했습니다.",
      "Failed to update reservation slot policy",
      error,
    );
  }

  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: result.status === "conflict" ? 409 : 422 },
    );
  }

  return Response.json({ slot: result.slot });
}
