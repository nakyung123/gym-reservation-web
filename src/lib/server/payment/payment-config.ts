import "server-only";
import type {
  PaymentProvider,
  PaymentProviderName,
} from "@/lib/server/payment/payment-provider";
import { createTossPaymentProvider } from "@/lib/server/payment/toss-payment-provider";
import type { PublicPaymentConfig } from "@/lib/payment";

// 결제 모드 SSOT. PAYMENT_PROVIDER 하나로 켜고 끈다.
// - 미설정 또는 "none": 결제 없이 바로 예약을 확정한다(기존 동작).
// - "toss": 예약 전에 토스 결제를 거친다.
// 모르는 값은 조용히 none으로 바꾸지 않고 throw한다(오타로 결제가 꺼진 채 배포되는 일을 막는다).
export type PaymentMode = "none" | PaymentProviderName;

export function getPaymentMode(): PaymentMode {
  const raw = process.env.PAYMENT_PROVIDER?.trim() ?? "";
  if (raw === "" || raw === "none") return "none";
  if (raw === "toss") return "toss";
  throw new Error(
    `PAYMENT_PROVIDER 값이 올바르지 않습니다: "${raw}". none 또는 toss만 허용합니다.`,
  );
}

// 결제 기록에 적힌 provider 이름으로 구현을 고른다.
// 결제 모드를 none으로 되돌린 뒤에도 이미 결제된 건의 환불은 이 경로로 처리된다.
export function getPaymentProviderByName(
  name: string,
): PaymentProvider {
  if (name !== "toss") {
    throw new Error(`알 수 없는 결제 provider입니다: "${name}"`);
  }
  const secretKey = process.env.TOSS_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("TOSS_SECRET_KEY가 설정되어 있지 않습니다.");
  }
  return createTossPaymentProvider({ secretKey });
}

// 화면에 내려줄 공개 설정. 클라이언트 키는 공개 값이지만 테스트 키만 허용한다.
export function getPublicPaymentConfig(): PublicPaymentConfig {
  const mode = getPaymentMode();
  if (mode === "none") return { mode: "none" };
  const clientKey = process.env.TOSS_CLIENT_KEY?.trim();
  if (!clientKey) {
    throw new Error("PAYMENT_PROVIDER=toss인데 TOSS_CLIENT_KEY가 설정되어 있지 않습니다.");
  }
  if (!clientKey.startsWith("test_")) {
    throw new Error(
      "TOSS_CLIENT_KEY가 테스트 키(test_로 시작)가 아닙니다. 이 프로젝트는 실결제를 허용하지 않습니다.",
    );
  }
  // 결제창(payment()) 연동은 API 개별 연동 키(test_ck_)만 받는다. 결제위젯 키(test_gck_)를 넣으면
  // 결제창을 열 때 SDK가 NotSupportedWidgetKeyError를 던지므로, 설정 단계에서 이유와 함께 막는다.
  if (!clientKey.startsWith("test_ck_")) {
    throw new Error(
      "TOSS_CLIENT_KEY가 API 개별 연동 키(test_ck_로 시작)가 아닙니다. 결제위젯 키(test_gck_)는 이 결제창 연동에 쓸 수 없습니다.",
    );
  }
  return { mode: "toss", clientKey };
}
