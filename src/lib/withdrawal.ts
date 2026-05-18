// 회원 탈퇴 사유 카테고리 + 입력 검증.
// 탈퇴 시 uid는 저장하지 않고 카테고리/자유텍스트만 익명으로 기록한다.

export const WITHDRAWAL_CATEGORIES = [
  "서비스 불만족",
  "요금정책 불만",
  "개인정보",
  "기타",
] as const;

export type WithdrawalCategory = (typeof WITHDRAWAL_CATEGORIES)[number];

export type WithdrawalInput = {
  category: WithdrawalCategory;
  detail: string | null;
};

const MAX_DETAIL_LENGTH = 300;

export type WithdrawalValidationResult =
  | { ok: true; input: WithdrawalInput }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCategory(value: unknown): value is WithdrawalCategory {
  return (
    typeof value === "string" &&
    (WITHDRAWAL_CATEGORIES as readonly string[]).includes(value)
  );
}

export function validateWithdrawalInput(
  body: unknown,
): WithdrawalValidationResult {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 본문이 올바르지 않습니다." };
  }
  if (!isCategory(body.category)) {
    return { ok: false, message: "탈퇴 사유를 선택해 주세요." };
  }

  let detail: string | null = null;
  if (body.detail !== null && body.detail !== undefined) {
    if (typeof body.detail !== "string") {
      return { ok: false, message: "상세 사유는 문자열이어야 합니다." };
    }
    const trimmed = body.detail.trim();
    if (trimmed.length > 0) {
      if ([...trimmed].length > MAX_DETAIL_LENGTH) {
        return {
          ok: false,
          message: `상세 사유는 ${MAX_DETAIL_LENGTH}자 이하로 입력해 주세요.`,
        };
      }
      detail = trimmed;
    }
  }

  return {
    ok: true,
    input: { category: body.category, detail },
  };
}
