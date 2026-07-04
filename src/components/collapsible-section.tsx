"use client";

import { useState } from "react";

// 예약하기·예약 상세 페이지가 공유하는 접기/펼치기 박스.
// 제목 줄 전체가 토글 버튼이고, 우측 ^ 아이콘이 열림/닫힘을 나타낸다(닫히면 180도 회전).
// 테두리 없이 흰 배경·라운드만 둔다(섹션 구분은 카드 간 간격으로).
export function CollapsibleSection({
  title,
  description,
  summary,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
  className,
}: {
  title: string;
  description?: string;
  // 접힌 상태에서 대신 보여줄 요약(선택). 접고 펴는 의미가 살도록 현재 선택값을 한눈에 보여준다.
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  // controlled 모드: open/onOpenChange를 주면 부모가 열림 상태를 제어한다(선택완료 자동 접기/펴기용).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const toggle = () => {
    if (isControlled) {
      onOpenChange?.(!open);
    } else {
      setOpenState((value) => !value);
    }
  };

  return (
    <section className={`rounded-2xl bg-white px-8 py-6 ${className ?? ""}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <div>
          <h2 className="text-[20px] font-bold text-slate-900">{title}</h2>
          {description && open ? (
            // 제목↔설명 간격 4px(mt-1). 접히면 설명은 숨긴다.
            <p className="mt-1 text-[14px] text-slate-500">{description}</p>
          ) : null}
        </div>
        <svg
          viewBox="0 0 16 16"
          className={`mt-1 h-4 w-4 shrink-0 text-slate-900 transition-transform ${
            open ? "" : "rotate-180"
          }`}
          aria-hidden="true"
        >
          <path
            d="M3 10l5-5 5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="mt-5">{children}</div>
      ) : summary ? (
        <div className="mt-4">{summary}</div>
      ) : null}
    </section>
  );
}
