// 관리자 고객 메모(UserNote)의 공유 타입·검증. 서버 전용 의존이 없어 UI 번들에도 안전하다.

export const CUSTOMER_NOTE_MAX_LENGTH = 1000;

// API/JSON 경계를 건너는 도메인 형태. createdAt/updatedAt은 ISO 문자열.
export type CustomerNote = {
  id: string;
  userId: string;
  adminUid: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ValidateNoteResult =
  | { ok: true; body: string }
  | { ok: false; message: string };

// 메모 본문 검증. 앞뒤 공백 제거 후 비어 있으면 거부, 최대 길이를 넘으면 거부.
export function validateCustomerNoteBody(value: unknown): ValidateNoteResult {
  if (typeof value !== "string") {
    return { ok: false, message: "메모 내용을 입력해 주세요." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "메모 내용을 입력해 주세요." };
  }
  if (trimmed.length > CUSTOMER_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `메모는 ${CUSTOMER_NOTE_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  return { ok: true, body: trimmed };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCustomerNote(value: unknown): value is CustomerNote {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.userId === "string" &&
    typeof value.adminUid === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}
