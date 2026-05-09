import type { NextRequest } from "next/server";
import { gymRepository } from "@/lib/gym-repository-provider";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { updateReservationSlotPolicy } from "@/lib/server/mysql-reservation-repository";
import type { Sport } from "@/types/domain";

export const dynamic = "force-dynamic";

const sports: readonly Sport[] = [
  "배드민턴",
  "농구",
  "풋살",
  "탁구",
  "배구",
];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type UpdateSlotBody = {
  gymId?: unknown;
  sport?: unknown;
  date?: unknown;
  time?: unknown;
  capacity?: unknown;
  isClosed?: unknown;
};

function isSport(value: unknown): value is Sport {
  return (
    typeof value === "string" && (sports as readonly string[]).includes(value)
  );
}

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
  const auth = verifyAdminTokenFromRequest(request);
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
    !datePattern.test(body.date) ||
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

  const gym = await gymRepository.findById(body.gymId);
  if (!gym) {
    return Response.json(
      { message: "체육관 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const result = await updateReservationSlotPolicy({
    gym,
    gymId: body.gymId,
    sport: body.sport,
    date: body.date,
    time: body.time,
    capacity,
    isClosed: body.isClosed,
  });

  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: result.status === "conflict" ? 409 : 422 },
    );
  }

  return Response.json({ slot: result.slot });
}
