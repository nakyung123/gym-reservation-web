import { type NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  sanitizeFaqMessages,
  streamFaqAnswer,
  type FaqTextStream,
} from "@/lib/server/faq-bot";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
  type RateLimitInput,
} from "@/lib/server/rate-limit";

// 공개 FAQ 안내봇 엔드포인트. 인증 없음(FAQ는 비로그인 접근이 본질) →
// rate limit이 유일·필수 방어선이라 3단으로 건다.
export const dynamic = "force-dynamic";

// rate limit 3단(전부 통과해야 LLM 호출). 공개 데모라 캡을 낮게 잡아 비용을 하드 바운드한다:
// 1) per-IP 분당 — 단발 버스트 차단
// 2) per-IP 일당 — 한 IP가 분당 한도를 지속해 전역 예산을 혼자 소진하는 드레인 차단
// 3) 전역 일당 — IP 수와 무관한 총지출 하드캡(전역 단일 row. 현 규모(50/일, 평균 <1/분)엔
//    무해하나 고볼륨 시 "all:${shard}" 샤딩 여지). haiku 답변 ≈ $0.006 × 50 ≈ 일 최대 ~$0.3.
//    (코드 밖 절대 천장은 Anthropic 콘솔 지출 한도 + 선불 크레딧이 별도로 담당.)
// 도구 호출이 붙어 질문 1건이 LLM 왕복 최대 (MAX_TOOL_CALLS + 1)회가 됐다.
// 여기서 세는 단위는 "질문"이지 "LLM 호출"이 아니므로, 질문 수만 줄인다고 지출이
// 줄지 않는다. 실제로 처음 조정(전역 20)은 질문을 2.5배 줄이면서 최악 호출 수는
// 50 → 80으로 늘려 양쪽 다 손해였다. 그래서 두 축을 함께 잡는다.
//
//   호출 상한: MAX_TOOL_CALLS=2 → 질문당 최대 3회(도구 2 + 마무리 1)
//   질문 상한: 전역 30 → 실사용(질문당 평균 1.5회) 기준 약 45회로 기존 50과 비슷
//
// per-IP 일당 15는 정상 사용을 막지 않는 선이다(8은 몇 번 물어보면 하루가 끝났다).
// 코드 밖 절대 천장은 Anthropic 콘솔 지출 한도 + 선불 크레딧이 계속 담당한다.
export const RATE_LIMITS: RateLimitInput[] = [
  { scope: "faq-chat:ip", identifier: "", limit: 5, windowMs: 60_000 },
  { scope: "faq-chat:ip-daily", identifier: "", limit: 15, windowMs: 86_400_000 },
  { scope: "faq-chat:global", identifier: "all", limit: 30, windowMs: 86_400_000 },
];

/**
 * 하루 LLM 호출 수의 설계 상한. 현재 설정(전역 30 × 질문당 최대 3회)에 맞춰 조여 둔다.
 *
 * 질문 수만 보면 비용을 잘못 판단한다 — 도구 루프가 질문 1건을 여러 호출로 늘리기 때문이다.
 * 전역 질문 한도나 MAX_TOOL_CALLS를 올리면 테스트가 막는다.
 *
 * 참고: 도구 도입 전 최악치는 50회(질문 50 × 1회)였다. 지금 최악치 90회는 그보다 높지만,
 * 실사용은 질문당 평균 1.5회라 약 45회로 이전과 비슷하다. 최악치를 더 낮추려면
 * 전역 한도가 아니라 MAX_TOOL_CALLS를 줄이는 쪽이 UX 손해가 적다.
 */
export const MAX_DAILY_LLM_CALLS = 90;

// 어느 한 단계라도 초과하면 429 응답을 돌려준다. 통과하면 null.
// checkRateLimit가 throw(DB 다운/secret 부재)하면 그대로 전파해 호출측이 fail-closed(503) 처리한다.
async function enforceRateLimits(ip: string): Promise<Response | null> {
  for (const base of RATE_LIMITS) {
    const identifier = base.scope === "faq-chat:global" ? base.identifier : ip;
    const result = await checkRateLimit({ ...base, identifier });
    if (!result.ok) {
      return rateLimitedJsonResponse(result);
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const sanitized = sanitizeFaqMessages(body);
  if (!sanitized.ok) {
    return Response.json({ message: sanitized.error }, { status: 400 });
  }

  // 비용 방어선 — LLM 호출 전에 평가한다.
  const ip = extractClientIp(request.headers);
  let limited: Response | null;
  try {
    limited = await enforceRateLimits(ip);
  } catch (error) {
    // fail-closed: rate limit을 계산하지 못하면 LLM을 호출하지 않는다(비용 컨트롤 우회 금지).
    // rate-limit 의존성(DB) 일시 장애라 503(Service Unavailable, 재시도 가능)으로 응답한다.
    return serverErrorResponse(
      "일시적으로 문의를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      "[faq-chat] rate limit check failed",
      error,
      503,
    );
  }
  if (limited) {
    return limited;
  }

  // 선택적 인증. Authorization 헤더가 있고 유효하면 그 uid로 조회 도구를 제공한다.
  // 없거나 유효하지 않으면 비로그인으로 취급해 기존 동작(FAQ만)을 그대로 유지한다 —
  // 이 엔드포인트는 비로그인 접근이 본질이므로 인증 실패를 401로 막지 않는다.
  //
  // uid는 여기서만 정해진다. 도구는 대상 사용자를 파라미터로 받지 않는다(faq-tools.ts).
  let userId: string | null = null;
  if (request.headers.get("authorization")) {
    const auth = await verifyIdTokenFromRequest(request);
    userId = auth.ok ? auth.uid : null;
  }

  let textStream: FaqTextStream;
  try {
    textStream = await streamFaqAnswer(sanitized.messages, { userId });
  } catch (error) {
    // 키 부재·도구 루프 실패 등 스트림 시작 전 오류는 명시 에러로 응답한다.
    return serverErrorResponse(
      "문의 도우미를 사용할 수 없습니다.",
      "[faq-chat] failed to start stream",
      error,
    );
  }

  // SDK 스트림 → web ReadableStream(plain text delta) 브릿지.
  // 스트림 바디가 시작된 뒤의 오류는 HTTP status로 못 바꾸므로 본문 안(in-band)에 표면화한다.
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error("[faq-chat] stream interrupted", error);
        controller.enqueue(
          encoder.encode(
            "\n\n[안내] 일시적인 오류로 답변이 중단되었습니다. 다시 시도해 주세요.",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
