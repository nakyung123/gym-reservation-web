import type { NextRequest } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit-log";
import { gymRepository } from "@/lib/gym-repository-provider";
import { isSport } from "@/lib/domain-constants";
import { isValidReservationDateValue } from "@/lib/reservation-rules";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { safeRecordAuditLog } from "@/lib/server/db-audit-repository";
import {
  RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT,
  updateReservationSlotPolicies,
} from "@/lib/server/db-reservation-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

type BulkUpdateSlotBody = {
  gymId?: unknown;
  sport?: unknown;
  dates?: unknown;
  times?: unknown;
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
    throw new Error("정원은 1팀 이상 999팀 이하의 정수여야 합니다.");
  }
  return value;
}

function parseStringList(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string")
  ) {
    return null;
  }

  return Array.from(new Set(value));
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

  let body: BulkUpdateSlotBody;
  try {
    body = (await request.json()) as BulkUpdateSlotBody;
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const dates = parseStringList(body.dates);
  const times = parseStringList(body.times);
  if (
    typeof body.gymId !== "string" ||
    !isSport(body.sport) ||
    dates === null ||
    times === null
  ) {
    return Response.json(
      { message: "슬롯 일괄 변경 요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (dates.some((date) => !isValidReservationDateValue(date))) {
    return Response.json(
      { message: "dates는 YYYY-MM-DD 형식의 배열이어야 합니다." },
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

  if (dates.length * times.length > RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT) {
    return Response.json(
      {
        message: `한 번에 변경할 수 있는 슬롯은 최대 ${RESERVATION_SLOT_BULK_POLICY_TARGET_LIMIT}개입니다.`,
      },
      { status: 400 },
    );
  }

  let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
  try {
    gym = await gymRepository.findById(body.gymId);
  } catch (error) {
    return serverErrorResponse(
      "체육관 정보를 불러오지 못했습니다.",
      "Failed to fetch gym for bulk slot policy update",
      error,
    );
  }
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  let result: Awaited<ReturnType<typeof updateReservationSlotPolicies>>;
  try {
    result = await updateReservationSlotPolicies({
      gym,
      gymId: body.gymId,
      sport: body.sport,
      dates,
      times,
      capacity,
      isClosed: body.isClosed,
    });
  } catch (error) {
    return serverErrorResponse(
      "슬롯 정책을 일괄 변경하지 못했습니다.",
      "Failed to bulk update reservation slot policies",
      error,
    );
  }

  if (!result.ok) {
    return Response.json(
      {
        status: result.status,
        message: result.message,
        conflicts: result.conflicts,
      },
      { status: result.status === "conflict" ? 409 : 422 },
    );
  }

  await safeRecordAuditLog({
    adminUid: auth.uid,
    action: AUDIT_ACTIONS.slotBulkUpdate,
    targetType: "slot",
    targetId: `${body.gymId}:${body.sport}`,
    summary: `슬롯 일괄 변경: ${gym.name} ${body.sport} (${result.updatedCount}건)`,
    metadata: {
      gymId: body.gymId,
      sport: body.sport,
      dateCount: dates.length,
      timeCount: times.length,
      updatedCount: result.updatedCount,
      ...(capacity !== undefined ? { capacity } : {}),
      ...(body.isClosed !== undefined ? { isClosed: body.isClosed } : {}),
    },
  });

  return Response.json({
    slots: result.slots,
    updatedCount: result.updatedCount,
  });
}
