import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { listUserReservations } from "@/lib/server/db-reservation-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import { getUserReservationCancellationDeadline } from "@/lib/reservation-rules";
import { isReservationStatus } from "@/lib/domain-constants";
import type { ReservationStatus } from "@/types/domain";

// FAQ 안내봇이 쓰는 조회 전용 도구.
//
// 보안 핵심: **어떤 도구도 userId를 파라미터로 받지 않는다.** 대상 사용자는 서버가
// 검증된 ID 토큰에서 주입한다. 모델이 대상을 고를 수 없으므로, 프롬프트 인젝션이
// 성공하더라도 호출자 본인의 데이터 밖으로는 나갈 수 없다.
//
// 쓰기 도구는 의도적으로 없다. 예약 취소는 확인 단계가 있는 기존 화면에서만 한다.

/** 한 번의 사용자 턴에서 허용하는 최대 도구 호출 수. 모델이 루프를 돌며 비용을 태우는 것을 막는다. */
export const MAX_TOOL_CALLS = 3;

/** 봇이 한 번에 안내할 예약 수 상한. 응답이 길어져 비용·환각이 늘어나는 것을 막는다. */
const MAX_RESERVATIONS_IN_RESULT = 5;

export const FAQ_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_my_reservations",
    description: [
      "로그인한 본인의 예약 내역을 조회한다.",
      "'내 예약 언제야', '예약 확인해줘', '취소할 수 있어?' 같은 본인 예약 관련 질문에만 사용한다.",
      "시설의 일반 정보(가격·운영시간)는 이 도구로 알 수 없다.",
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["reserved", "cancelled", "used"],
          description:
            "특정 상태만 보려면 지정한다. 생략하면 최근 예약을 상태 구분 없이 가져온다. 보통 'reserved'로 다가오는 예약을 본다.",
        },
      },
      required: [],
    },
  },
];

export type FaqToolContext = {
  /** 검증된 ID 토큰에서 온 uid. 비로그인이면 null(도구를 아예 제공하지 않는다). */
  userId: string | null;
};

type ToolOutcome = { ok: true; text: string } | { ok: false; text: string };

// 모델이 넘긴 status는 신뢰하지 않는다. 도메인 상수로 좁혀 통과시킨다.
function isReservationStatusInput(value: unknown): value is ReservationStatus {
  return isReservationStatus(value);
}

// 예약 1건을 봇이 그대로 읽어줄 수 있는 짧은 문장으로 만든다.
// 결제/환불처럼 데모인 항목은 넣지 않는다(system 가드의 결제 정직성과 충돌 방지).
function describeReservation(
  reservation: Awaited<ReturnType<typeof listUserReservations>>[number],
  gymName: string,
): string {
  const parts = [
    `${reservation.date} ${reservation.time}`,
    gymName,
    reservation.sport,
    `상태=${reservation.status}`,
  ];

  if (reservation.status === "reserved") {
    const deadline = getUserReservationCancellationDeadline(reservation);
    if (deadline) {
      parts.push(`취소가능시한=${deadline.toISOString()}`);
    }
  }

  return parts.join(" / ");
}

async function runGetMyReservations(
  input: unknown,
  context: FaqToolContext,
): Promise<ToolOutcome> {
  if (!context.userId) {
    // 비로그인 상태에서는 도구를 제공하지 않으므로 정상적으로는 도달하지 않는다.
    // 방어적으로 남겨 둔다 — 조용히 빈 배열을 주면 봇이 "예약이 없다"고 잘못 답한다.
    return {
      ok: false,
      text: "로그인하지 않은 사용자입니다. 예약 내역은 로그인 후 확인할 수 있다고 안내하세요.",
    };
  }

  const status =
    input && typeof input === "object" && "status" in input
      ? (input as { status?: unknown }).status
      : undefined;

  const reservations = await listUserReservations(context.userId, {
    status: isReservationStatusInput(status) ? status : undefined,
  });

  if (reservations.length === 0) {
    return { ok: true, text: "조회된 예약이 없습니다." };
  }

  // 최신순으로 상한만큼만. 시설명은 표시용이라 실패해도 id로 대체한다.
  const recent = reservations.slice(0, MAX_RESERVATIONS_IN_RESULT);
  const gymNames = new Map<string, string>();
  for (const reservation of recent) {
    if (gymNames.has(reservation.gymId)) continue;
    try {
      const gym = await gymRepository.findById(reservation.gymId);
      gymNames.set(reservation.gymId, gym?.name ?? reservation.gymId);
    } catch {
      gymNames.set(reservation.gymId, reservation.gymId);
    }
  }

  const lines = recent.map((reservation) =>
    describeReservation(
      reservation,
      gymNames.get(reservation.gymId) ?? reservation.gymId,
    ),
  );
  const omitted = reservations.length - recent.length;

  return {
    ok: true,
    text: [
      `총 ${reservations.length}건 중 최근 ${recent.length}건:`,
      ...lines,
      omitted > 0
        ? `(나머지 ${omitted}건은 생략됨. 전체는 마이페이지에서 확인하도록 안내하세요.)`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * 모델이 요청한 도구를 실행하고 tool_result 블록을 만든다.
 *
 * 실패는 throw하지 않고 is_error로 돌려준다. 도구 하나가 실패했다고 대화 전체를
 * 끊으면 사용자는 아무 답도 못 받는다. 모델이 실패 사실을 알고 안내하게 한다.
 */
export async function runFaqTool(
  block: { id: string; name: string; input: unknown },
  context: FaqToolContext,
): Promise<Anthropic.ToolResultBlockParam> {
  let outcome: ToolOutcome;

  try {
    if (block.name === "get_my_reservations") {
      outcome = await runGetMyReservations(block.input, context);
    } else {
      outcome = {
        ok: false,
        text: `알 수 없는 도구입니다: ${block.name}`,
      };
    }
  } catch (error) {
    console.error("[faq-tools] 도구 실행 실패", block.name, error);
    outcome = {
      ok: false,
      text: "예약 정보를 조회하지 못했습니다. 사용자에게 잠시 후 다시 시도하거나 마이페이지에서 직접 확인하도록 안내하세요.",
    };
  }

  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: outcome.text,
    ...(outcome.ok ? {} : { is_error: true }),
  };
}
