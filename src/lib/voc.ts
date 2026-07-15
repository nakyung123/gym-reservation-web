import { isVocCategory } from "@/lib/domain-constants";
import type { VocCategory, VocPost } from "@/types/domain";

// 공개 문의 게시판 입력 검증·마스킹 SSOT(클라이언트·서버 공용).
// 민감정보(연락처/이메일/비밀번호)는 서버에만 머물고, 공개 응답 형태(VocPost)는 마스킹된 성명만 노출한다.

export const VOC_BODY_MAX = 5000;
export const VOC_NAME_MAX = 50;
// 임시 비밀번호는 숫자 4자리.
export const VOC_PASSWORD_PATTERN = /^\d{4}$/;

// 같은 성명+분류+본문을 이 시간(ms) 내 재전송하면 기존 글을 반환한다(익명 게시판 중복 생성 방지).
// 익명이라 uid가 없으므로 inquiry(INQUIRY_DEDUP_WINDOW_MS, title+body 키)와 달리 성명을 키에 포함한다.
export const VOC_DEDUP_WINDOW_MS = 60_000;

// 제목 필드는 별도로 받지 않는다. 목록 제목은 분류 라벨을 쓴다.
export type VocInput = {
  category: unknown;
  gymId?: unknown;
  authorName: unknown;
  phone?: unknown;
  email?: unknown;
  body: unknown;
  password: unknown;
};

export type VocValidated = {
  category: VocCategory;
  gymId: string | null;
  authorName: string;
  phone: string | null;
  email: string | null;
  body: string;
  password: string;
};

export type VocInputValidation =
  | { ok: true; input: VocValidated }
  | { ok: false; message: string };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStr(value: unknown): string | null {
  const trimmed = str(value);
  return trimmed.length === 0 ? null : trimmed;
}

// 아주 느슨한 이메일 형식 검사(형식 확인용, 인증은 하지 않음).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateVocInput(input: VocInput): VocInputValidation {
  if (!isVocCategory(input.category)) {
    return { ok: false, message: "분류를 선택해 주세요." };
  }

  const authorName = str(input.authorName);
  if (authorName.length < 1 || authorName.length > VOC_NAME_MAX) {
    return {
      ok: false,
      message: `성명은 1자 이상 ${VOC_NAME_MAX}자 이하여야 합니다.`,
    };
  }

  const body = str(input.body);
  if (body.length < 1 || body.length > VOC_BODY_MAX) {
    return {
      ok: false,
      message: `내용은 1자 이상 ${VOC_BODY_MAX}자 이하여야 합니다.`,
    };
  }

  const password = typeof input.password === "string" ? input.password : "";
  if (!VOC_PASSWORD_PATTERN.test(password)) {
    return { ok: false, message: "임시 비밀번호는 숫자 4자리여야 합니다." };
  }

  const email = nullableStr(input.email);
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "이메일 형식이 올바르지 않습니다." };
  }

  return {
    ok: true,
    input: {
      category: input.category,
      gymId: nullableStr(input.gymId),
      authorName,
      phone: nullableStr(input.phone),
      email,
      body,
      password,
    },
  };
}

// 성명 마스킹: 홍길동 → 홍*동, 김철 → 김*, 김 → 김. (개인정보 최소 노출)
export function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

// 서버 공개 응답의 VocPost 형식 검증(client가 신뢰 전 확인).
export function isVocPost(value: unknown): value is VocPost {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VocPost>;
  return (
    typeof candidate.id === "string" &&
    isVocCategory(candidate.category) &&
    (candidate.gymId === null || typeof candidate.gymId === "string") &&
    typeof candidate.authorName === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.createdAt === "string"
  );
}
