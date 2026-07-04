import type {
  InquiryStatus,
  PaymentMethod,
  ReservationStatus,
  Sport,
  VocCategory,
} from "@/types/domain";

export const SPORTS = [
  "배드민턴",
  "농구",
  "풋살",
  "탁구",
  "배구",
] as const satisfies readonly Sport[];

export const RESERVATION_STATUSES = [
  "reserved",
  "cancelled",
  "used",
] as const satisfies readonly ReservationStatus[];

// 데모 시드(prisma/seed-demo-reservations.mjs)가 만드는 예약 id의 prefix(SSOT).
// 운영 집계는 이 prefix를 "제외"하고, Sheets 데모 원장은 이 prefix만 "포함"해
// 데모/운영 데이터를 격리한다. .mjs 시드는 TS import가 안 되므로 같은 리터럴을 자체 보유한다
// — 값을 바꾸면 양쪽(여기 + seed-demo-reservations.mjs의 DEMO_PREFIX)을 함께 고쳐야 한다.
export const DEMO_RESERVATION_ID_PREFIX = "demo-rev-";

export function isSport(value: unknown): value is Sport {
  return (
    typeof value === "string" && (SPORTS as readonly string[]).includes(value)
  );
}

export function isReservationStatus(
  value: unknown,
): value is ReservationStatus {
  return (
    typeof value === "string" &&
    (RESERVATION_STATUSES as readonly string[]).includes(value)
  );
}

// 결제 수단 SSOT(예약 폼 선택지·서버 검증·상세 표시 공용). 값=DB 저장값, label=국문 표시.
export const PAYMENT_METHODS = [
  "card",
  "easy-pay",
  "virtual-account",
] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "카드결제",
  "easy-pay": "간편결제",
  "virtual-account": "가상계좌(무통장 입금)",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === "string" &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

export const INQUIRY_STATUSES = [
  "open",
  "answered",
] as const satisfies readonly InquiryStatus[];

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return (
    typeof value === "string" &&
    (INQUIRY_STATUSES as readonly string[]).includes(value)
  );
}

// 공개 문의 게시판 분류 SSOT(작성 폼 선택지·목록/상세 표시 공용).
export const VOC_CATEGORIES = [
  "inquiry",
  "praise",
  "complaint",
  "suggestion",
] as const satisfies readonly VocCategory[];

export const VOC_CATEGORY_LABELS: Record<VocCategory, string> = {
  inquiry: "문의합니다",
  praise: "칭찬합니다",
  complaint: "건의합니다",
  suggestion: "제안합니다",
};

export function isVocCategory(value: unknown): value is VocCategory {
  return (
    typeof value === "string" &&
    (VOC_CATEGORIES as readonly string[]).includes(value)
  );
}
