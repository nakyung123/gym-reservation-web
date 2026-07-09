import { isInquiryStatus } from "@/lib/domain-constants";
import type { Inquiry } from "@/types/domain";

// 1:1 문의의 입력 검증·타입가드 SSOT(클라이언트·서버·repository 공용).
// user-profile.ts(validateUserProfileInput + isUserProfile)와 같은 패턴.

export const INQUIRY_TITLE_MAX = 100;
export const INQUIRY_BODY_MAX = 2000;
export const INQUIRY_ANSWER_MAX = 2000;

// 같은 uid가 동일 title+body를 이 시간(ms) 내 재전송하면 기존 건을 반환한다(중복 생성 방지).
export const INQUIRY_DEDUP_WINDOW_MS = 60_000;

// 목록 페이지 크기(서버 repository·클라이언트 페이지네이션 공용 SSOT).
export const INQUIRY_PAGE_SIZE = 10;

// 문의 상태 라벨 SSOT(사용자·관리자 화면 공용).
export const inquiryStatusLabel: Record<"open" | "answered", string> = {
  open: "답변 대기",
  answered: "답변 완료",
};

export type InquiryInput = {
  title: string;
  body: string;
  // 신뢰 경계에서 정규화하므로 unknown 허용(string이면 사용, 그 외/공백/미전송이면 null).
  gymId?: unknown;
};

export type InquiryInputValidation =
  | { ok: true; input: { title: string; body: string; gymId: string | null } }
  | { ok: false; message: string };

function normalizeGymId(gymId: unknown): string | null {
  return typeof gymId === "string" && gymId.trim() !== "" ? gymId : null;
}

export function validateInquiryInput(input: InquiryInput): InquiryInputValidation {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  if (title.length < 1 || title.length > INQUIRY_TITLE_MAX) {
    return {
      ok: false,
      message: `제목은 1자 이상 ${INQUIRY_TITLE_MAX}자 이하여야 합니다.`,
    };
  }
  if (body.length < 1 || body.length > INQUIRY_BODY_MAX) {
    return {
      ok: false,
      message: `내용은 1자 이상 ${INQUIRY_BODY_MAX}자 이하여야 합니다.`,
    };
  }

  return { ok: true, input: { title, body, gymId: normalizeGymId(input.gymId) } };
}

export type InquiryAnswerValidation =
  | { ok: true; answer: string }
  | { ok: false; message: string };

export function validateInquiryAnswer(answer: unknown): InquiryAnswerValidation {
  const value = typeof answer === "string" ? answer.trim() : "";
  if (value.length < 1 || value.length > INQUIRY_ANSWER_MAX) {
    return {
      ok: false,
      message: `답변은 1자 이상 ${INQUIRY_ANSWER_MAX}자 이하여야 합니다.`,
    };
  }
  return { ok: true, answer: value };
}

// 서버 응답의 inquiry 객체 형식 검증(client가 신뢰 전 확인).
export function isInquiry(value: unknown): value is Inquiry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Inquiry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.userId === "string" &&
    (candidate.gymId === null || typeof candidate.gymId === "string") &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    isInquiryStatus(candidate.status) &&
    (candidate.answer === null || typeof candidate.answer === "string") &&
    (candidate.answeredAt === null || typeof candidate.answeredAt === "string") &&
    typeof candidate.createdAt === "string"
  );
}
