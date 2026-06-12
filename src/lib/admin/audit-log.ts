// 관리자 운영 이력(audit log)의 공유 타입과 액션 식별자.
// 라우트(기록 측)와 admin UI(조회 측)가 같은 action 문자열·도메인 형태를 공유하는 SSOT다.
// 서버 전용 의존이 없으므로 클라이언트 번들에도 안전하게 포함될 수 있다.

// audit action 식별자. "<도메인>.<동작>" 형태. DB audit_logs.action(VarChar 64)에 그대로 저장된다.
export const AUDIT_ACTIONS = {
  reservationCancel: "reservation.cancel",
  reservationUse: "reservation.use",
  gymCreate: "gym.create",
  gymUpdate: "gym.update",
  slotUpdate: "slot.update",
  slotBulkUpdate: "slot.bulk_update",
  customerNoteCreate: "customer_note.create",
  customerNoteDelete: "customer_note.delete",
  bannerCreate: "banner.create",
  bannerUpdate: "banner.update",
  bannerDelete: "banner.delete",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// action → 한글 라벨(UI 표시 SSOT). 모르는 action은 원문 그대로 보여준다.
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  [AUDIT_ACTIONS.reservationCancel]: "예약 취소",
  [AUDIT_ACTIONS.reservationUse]: "예약 이용 완료",
  [AUDIT_ACTIONS.gymCreate]: "시설 생성",
  [AUDIT_ACTIONS.gymUpdate]: "시설 수정",
  [AUDIT_ACTIONS.slotUpdate]: "슬롯 변경",
  [AUDIT_ACTIONS.slotBulkUpdate]: "슬롯 일괄 변경",
  [AUDIT_ACTIONS.customerNoteCreate]: "고객 메모 추가",
  [AUDIT_ACTIONS.customerNoteDelete]: "고객 메모 삭제",
  [AUDIT_ACTIONS.bannerCreate]: "배너 생성",
  [AUDIT_ACTIONS.bannerUpdate]: "배너 수정",
  [AUDIT_ACTIONS.bannerDelete]: "배너 삭제",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

// target 종류 → 한글 라벨.
export const AUDIT_TARGET_TYPE_LABEL: Record<string, string> = {
  reservation: "예약",
  gym: "시설",
  slot: "슬롯",
  user: "고객",
  banner: "배너",
};

export function auditTargetTypeLabel(targetType: string): string {
  return AUDIT_TARGET_TYPE_LABEL[targetType] ?? targetType;
}

// audit metadata는 PII 원문(email/이름 등)을 담지 않는다. 식별자(uid)·상태값·건수 수준만 둔다.
// null은 Prisma JSON InputJsonValue 제약을 피하려 의도적으로 제외한다(없는 값은 키 자체를 생략).
export type AuditMetadata = Record<string, string | number | boolean>;

// API/JSON 경계를 건너는 도메인 형태. createdAt은 ISO 문자열(도메인 날짜 컨벤션과 동일).
export type AuditLogEntry = {
  id: string;
  adminUid: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAuditLogEntry(value: unknown): value is AuditLogEntry {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.adminUid === "string" &&
    typeof value.action === "string" &&
    typeof value.targetType === "string" &&
    typeof value.targetId === "string" &&
    typeof value.summary === "string" &&
    typeof value.createdAt === "string" &&
    (value.metadata === null || isPlainObject(value.metadata))
  );
}
