"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * 공용 커스텀 드롭다운(홈 검색바·시설찾기 지역 선택 공유).
 * 네이티브 <select>의 브라우저 기본 화살표/목록 대신, 사이트 표준 chevron(아래) +
 * SearchBar(공지·FAQ)와 동일한 목록 스타일을 써서 전 화면 드롭다운을 일관되게 한다.
 *  - 제어 컴포넌트: value/onChange로 부모가 상태를 소유한다(cascade·live 필터 모두 지원).
 *  - 토글·바깥 클릭·Esc 닫기만 클라이언트에서 처리한다.
 * 트리거 룩(높이·radius·보더)은 triggerClassName으로 화면별로 맞추되, 화살표/목록 톤은 공통.
 */
export type SelectOption = { value: string; label: string };

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function SelectMenu({
  value,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  onChange,
  triggerClassName = "",
}: {
  value: string;
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((item) => item.value === value);
  // 트리거가 disabled면 토글이 불가능해 열릴 수 없지만, 상위 단계 초기화로
  // disabled가 켜지는 경우를 대비해 렌더 단계에서 목록을 닫힌 것으로 파생한다(effect 불필요).
  const isOpen = open && !disabled;

  // 바깥 클릭 / Esc 로 닫는다(열려 있을 때만 리스너 부착).
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 outline-none ${triggerClassName}`}
      >
        <span className={`truncate ${selected ? "text-slate-950" : "text-subtle"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-64 w-full min-w-[160px] overflow-auto rounded-lg border border-line bg-white py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          {options.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === value}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-2.5 text-left text-[15px] transition hover:bg-surface-2 ${
                  item.value === value
                    ? "font-semibold text-accent-strong"
                    : "text-muted"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
