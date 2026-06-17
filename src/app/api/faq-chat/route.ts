import { type NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import { sanitizeFaqMessages, streamFaqAnswer } from "@/lib/server/faq-bot";
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
const RATE_LIMITS: RateLimitInput[] = [
  { scope: "faq-chat:ip", identifier: "", limit: 10, windowMs: 60_000 },
  { scope: "faq-chat:ip-daily", identifier: "", limit: 15, windowMs: 86_400_000 },
  { scope: "faq-chat:global", identifier: "all", limit: 50, windowMs: 86_400_000 },
];

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

  let sdkStream: ReturnType<typeof streamFaqAnswer>;
  try {
    sdkStream = streamFaqAnswer(sanitized.messages);
  } catch (error) {
    // 키 부재 등 시작 자체 실패는 스트림 전이라 명시 에러로 응답한다.
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
        for await (const event of sdkStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
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
