"use client";

import type { ReactNode } from "react";

/**
 * 공통 모달 프레임(합성 컴포넌트).
 *
 * overlay/card 클래스가 여러 파일에 복붙되어 있던 것을 통합한다.
 * 내용(제목/본문/버튼)은 children 합성으로 받으므로 화면별 자유도는 유지된다.
 * 상태 분기(성공/실패/확인)는 호출부 책임 — 이 컴포넌트는 "틀"만 담당한다(SRP).
 */
export function Modal({
  labelledBy,
  children,
}: {
  /** 카드 안 제목 요소의 id. 지정 시 aria-labelledby로 연결한다. */
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}

/** 모달 하단 버튼 줄. 정렬만 담당한다(기본 오른쪽 정렬, 확인류 모달은 center). */
export function ModalActions({
  align = "end",
  children,
}: {
  align?: "end" | "center";
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-5 flex gap-2 ${
        align === "center" ? "justify-center gap-3" : "justify-end"
      }`}
    >
      {children}
    </div>
  );
}
