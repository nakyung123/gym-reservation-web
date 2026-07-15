"use client";

import type { ReactNode } from "react";

/**
 * 마이페이지 회원정보 폼 계열의 공용 필드 프리미티브.
 *
 * 로그인/가입 폼(form-fields.tsx, h-10 + Auth 네임스페이스)과는 시각 규격이 다른
 * 폼 스타일(h-11)이므로 별도 모듈로 둔다.
 * account-panel · password-change-inline · withdraw-modal이 공유한다.
 */

/** 편집 가능한 입력의 공통 클래스(높이 56, 포커스 시 검은 테두리). */
export const INPUT_CLASS =
  "h-[56px] w-full rounded-md border border-line-strong bg-white px-4 text-[16px] text-slate-950 placeholder:text-slate-400 focus:border-[#111] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

/** 읽기 전용(아이디·이메일) 입력의 공통 클래스. 배경은 눈에 띄게 #e4e4e4. */
export const READONLY_INPUT_CLASS =
  "h-[56px] w-full cursor-not-allowed rounded-md border border-line bg-[#e4e4e4] px-4 text-[16px] text-slate-600";

/** 필드 라벨(18px). required면 빨간 별표(*)를 붙인다. */
export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-[18px] font-bold text-slate-800">
      {children}
      {required ? <span className="ml-0.5 text-error">*</span> : null}
    </label>
  );
}
